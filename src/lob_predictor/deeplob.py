"""DeepLOB-style temporal CNN for order book prediction."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
from sklearn.metrics import accuracy_score, f1_score
from torch import nn
from torch.utils.data import DataLoader, Dataset

from lob_predictor.data import load_order_book
from lob_predictor.labels import LabelConfig, make_direction_labels


@dataclass(frozen=True)
class DeepLOBConfig:
    window: int = 100
    horizon: int = 50
    threshold_bps: float = 0.5
    batch_size: int = 128
    epochs: int = 3
    learning_rate: float = 1e-3
    train_fraction: float = 0.8


class LOBWindowDataset(Dataset[tuple[torch.Tensor, torch.Tensor]]):
    """Rolling windows of raw L2 book values."""

    def __init__(self, values: np.ndarray, labels: np.ndarray, window: int):
        if window <= 1:
            raise ValueError("window must be greater than 1.")
        self.values = values.astype(np.float32)
        self.labels = labels.astype(np.int64)
        self.window = window
        self.indices = np.arange(window - 1, len(labels))
        self.indices = self.indices[self.labels[self.indices] >= 0]

    def __len__(self) -> int:
        return int(len(self.indices))

    def __getitem__(self, item: int) -> tuple[torch.Tensor, torch.Tensor]:
        end = self.indices[item] + 1
        start = end - self.window
        window = self.values[start:end]
        label = self.labels[self.indices[item]]
        return torch.from_numpy(window), torch.tensor(label, dtype=torch.long)


class DeepLOBLite(nn.Module):
    """Compact DeepLOB-inspired model.

    The original DeepLOB combines convolutions, inception-style blocks, and recurrent
    layers. This MVP keeps the same spirit with temporal convolutions over book windows
    while staying small enough to train on a laptop.
    """

    def __init__(self, feature_count: int = 40, class_count: int = 3):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv1d(feature_count, 64, kernel_size=3, padding=1),
            nn.BatchNorm1d(64),
            nn.ReLU(),
            nn.Conv1d(64, 64, kernel_size=5, padding=2),
            nn.BatchNorm1d(64),
            nn.ReLU(),
            nn.Conv1d(64, 128, kernel_size=7, padding=3),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.AdaptiveAvgPool1d(1),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.1),
            nn.Linear(128, class_count),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Input is batch x time x features; Conv1d expects batch x features x time.
        x = x.transpose(1, 2)
        return self.classifier(self.net(x))


def normalize_train_test(
    train_values: np.ndarray, test_values: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Standardize using train-only statistics."""
    mean = train_values.mean(axis=0, keepdims=True)
    std = train_values.std(axis=0, keepdims=True) + 1e-6
    return (train_values - mean) / std, (test_values - mean) / std


def train_deeplob(
    data_path: str | Path,
    config: DeepLOBConfig | None = None,
    device: str | None = None,
) -> tuple[DeepLOBLite, dict[str, Any]]:
    """Train the compact DeepLOB-style model."""
    config = config or DeepLOBConfig()
    book = load_order_book(data_path)
    labels = make_direction_labels(
        book,
        LabelConfig(horizon=config.horizon, threshold_bps=config.threshold_bps),
    ).to_numpy()
    values = book.to_numpy(dtype=np.float32)

    split_index = int(len(values) * config.train_fraction)
    train_values, test_values = values[:split_index], values[split_index:]
    train_labels, test_labels = labels[:split_index], labels[split_index:]
    train_values, test_values = normalize_train_test(train_values, test_values)

    train_dataset = LOBWindowDataset(train_values, train_labels, config.window)
    test_dataset = LOBWindowDataset(test_values, test_labels, config.window)
    train_loader = DataLoader(train_dataset, batch_size=config.batch_size, shuffle=True)
    test_loader = DataLoader(test_dataset, batch_size=config.batch_size, shuffle=False)

    selected_device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
    model = DeepLOBLite(feature_count=values.shape[1]).to(selected_device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.learning_rate)
    criterion = nn.CrossEntropyLoss()

    for _ in range(config.epochs):
        model.train()
        for batch_x, batch_y in train_loader:
            batch_x = batch_x.to(selected_device)
            batch_y = batch_y.to(selected_device)
            optimizer.zero_grad()
            loss = criterion(model(batch_x), batch_y)
            loss.backward()
            optimizer.step()

    y_true: list[int] = []
    y_pred: list[int] = []
    model.eval()
    with torch.no_grad():
        for batch_x, batch_y in test_loader:
            logits = model(batch_x.to(selected_device))
            predictions = logits.argmax(dim=1).cpu().numpy()
            y_true.extend(batch_y.numpy().tolist())
            y_pred.extend(predictions.tolist())

    metrics = {
        "rows": int(len(values)),
        "train_windows": int(len(train_dataset)),
        "test_windows": int(len(test_dataset)),
        "window": int(config.window),
        "horizon": int(config.horizon),
        "accuracy": float(accuracy_score(y_true, y_pred)) if y_true else 0.0,
        "macro_f1": float(f1_score(y_true, y_pred, average="macro")) if y_true else 0.0,
    }
    return model, metrics


def save_deeplob_model(model: DeepLOBLite, path: str | Path, metrics: dict[str, Any]) -> None:
    """Persist model weights and metadata."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"state_dict": model.state_dict(), "metrics": metrics}, path)
