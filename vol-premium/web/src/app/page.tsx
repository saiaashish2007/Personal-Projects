import {
  DrawdownChart,
  EquityChart,
  ExposureChart,
  ForecastChart,
  GapCurve,
  ImportanceChart,
  SharpeHistogram,
} from '@/components/charts';
import {
  forecast,
  MODEL_LABELS,
  num,
  pct,
  REPO,
  risk,
  strategy,
  summary,
  type StrategyKey,
} from '@/lib/data';

const KEYS: StrategyKey[] = ['always', 'naive', 'harx', 'xgb', 'oracle'];

function Label({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">{children}</p>;
}

function Section({ id, label, title, children }: { id: string; label: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="border-t border-neutral-200 py-14">
      <Label>{label}</Label>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-6 space-y-6">{children}</div>
    </section>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return <div className="max-w-3xl space-y-4 text-[15px] leading-relaxed text-neutral-700">{children}</div>;
}

function Card({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-5">
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-neutral-700">{label}</p>
      {sub && <p className="mt-1 font-mono text-[11px] text-neutral-500">{sub}</p>}
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-5">
      <p className="text-sm font-medium">{title}</p>
      {note && <p className="mt-1 text-xs text-neutral-500">{note}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Table({ head, rows, highlight }: { head: string[]; rows: React.ReactNode[][]; highlight?: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-4 py-2.5 font-medium text-neutral-600 ${i > 0 ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-[13px]">
          {rows.map((r, i) => (
            <tr key={i} className={`border-t border-neutral-100 ${i === highlight ? 'bg-teal-50/60' : ''}`}>
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-2 ${j === 0 ? 'font-sans text-neutral-800' : 'text-right'}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Page() {
  const s = strategy.stats;
  const h = summary.headline;
  const boot = risk.bootstrap;
  const pairedX = boot.paired.xgb;
  const harx = forecast.metrics.find((m) => m.model === 'harx')!;
  const xgbM = forecast.metrics.find((m) => m.model === 'xgb')!;
  const gfc = strategy.crashes.find((c) => c.name === 'Global financial crisis');
  const stress = risk.stress;
  const c = summary.current;
  const crashesWon = strategy.crashes.filter((r) => r.xgb > r.always + 0.0005).length;

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <span className="flex items-center gap-2.5">
            <span className="inline-block h-2 w-2 rounded-full bg-teal-600" />
            <span className="text-[15px] font-semibold tracking-tight">Volatility Risk Premium</span>
          </span>
          <nav className="hidden items-center gap-6 text-sm text-neutral-600 md:flex">
            <a href="#trade" className="hover:text-neutral-900">The trade</a>
            <a href="#forecast" className="hover:text-neutral-900">Forecast</a>
            <a href="#backtest" className="hover:text-neutral-900">Backtest</a>
            <a href="#montecarlo" className="hover:text-neutral-900">Monte Carlo</a>
            <a href="#method" className="hover:text-neutral-900">Method</a>
          </nav>
          <a
            href={REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            GitHub
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="py-14">
          <Label>Personal Project · Quant research</Label>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Timing the Volatility Risk Premium</h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-neutral-700">
            Options on the S&amp;P 500 are usually priced for more volatility than actually shows up. This project
            sells that gap with delta-hedged straddles priced by Black-Scholes, uses an XGBoost forecast of realized
            volatility to decide when to step aside, and uses Monte Carlo to separate skill from luck.
          </p>
          <p className="mt-3 font-mono text-[11px] text-neutral-500">
            Out-of-sample {summary.oos_start} → {summary.oos_end} · {summary.oos_days.toLocaleString()} trading days ·
            data through {summary.data_through}
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card
              value={`${num(h.sharpe_xgb)} vs ${num(h.sharpe_always)}`}
              label="Sharpe, timed vs always selling"
              sub="after option spreads and hedging costs"
            />
            <Card
              value={`${pct(h.mdd_xgb)} vs ${pct(h.mdd_always)}`}
              label="Max drawdown"
              sub={`worst month ${pct(s.xgb.worst_month)} vs ${pct(s.always.worst_month)}`}
            />
            <Card
              value={gfc ? `${pct(gfc.xgb)} vs ${pct(gfc.always)}` : '—'}
              label="Loss in the 2008 crisis"
              sub="Sep – Dec 2008, forecast out of sample"
            />
            <Card
              value={pct(pairedX.prob_beats_always, 0)}
              label="Bootstrap draws where timing wins"
              sub={`Sharpe gain 95% CI ${num(pairedX.sharpe_diff.lo)} to +${num(pairedX.sharpe_diff.hi)}`}
            />
          </div>

          <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-sm font-medium">Latest signal · {c.date}</p>
              <span
                className={`rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${
                  c.sell ? 'bg-teal-600 text-white' : 'bg-neutral-900 text-white'
                }`}
              >
                {c.sell ? 'Sell the straddle' : 'Stay flat'}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 font-mono text-sm sm:grid-cols-5">
              <div>
                <p className="text-[11px] text-neutral-500">VIX</p>
                <p>{num(c.vix)}</p>
              </div>
              <div>
                <p className="text-[11px] text-neutral-500">ATM implied (proxy)</p>
                <p>{num(c.iv_atm)}</p>
              </div>
              <div>
                <p className="text-[11px] text-neutral-500">XGBoost forecast</p>
                <p>{num(c.fc_xgb)}</p>
              </div>
              <div>
                <p className="text-[11px] text-neutral-500">Trailing 21-day realized</p>
                <p>{num(c.rv_trailing)}</p>
              </div>
              <div>
                <p className="text-[11px] text-neutral-500">Edge (vol points)</p>
                <p>{c.edge > 0 ? '+' : ''}{num(c.edge)}</p>
              </div>
            </div>
          </div>
        </section>

        <Section id="trade" label="01 · The trade" title="Selling insurance, one month at a time">
          <Prose>
            <p>
              Every trading day the book sells a 21-day at-the-money S&amp;P 500 straddle (a call and a put at the
              current price) and buys or sells the index each close so the position has no directional exposure.
              What is left is a bet on volatility alone. By Black-Scholes, the daily P&amp;L of a delta-hedged option is
              approximately <span className="font-mono text-[13px]">½ · Γ · S² · (σ²implied − σ²realized) · dt</span>: the seller earns
              the gap between the volatility priced in and the volatility the market actually delivers.
            </p>
            <p>
              That gap is usually positive, because investors pay up for crash protection. But when realized volatility
              explodes, the seller pays for the crash. Always-sell has a skew of {num(s.always.skew, 1)} and its worst
              month ({s.always.worst_month_date}) lost {pct(-s.always.worst_month)}, about{' '}
              {num(-s.always.worst_month / s.always.ann_return, 1)} years of average returns. The research question is whether a model can tell, ahead of time, when not to sell.
            </p>
            <p>
              Sizing is fixed: 21 overlapping trades, each with 1/21 of capital in underlying notional. A timing rule
              decides, from information at that day&apos;s close, whether the new slot is filled. Straddles are priced
              at {summary.costs.atm_ratio} × VIX, pay {summary.costs.spread_vol_pts} vol points of half-spread on entry, and each
              hedge trade pays {summary.costs.hedge_cost_bps} bp.
            </p>
          </Prose>
        </Section>

        <Section id="forecast" label="02 · Forecast" title="What will volatility be over the next 21 days?">
          <Prose>
            <p>
              Three models forecast 21-day realized volatility, refit every quarter on an expanding window with
              training rows purged so no target overlaps the forecast period. HAR is the standard academic baseline
              (daily, weekly and monthly realized vol); HAR-X adds VIX. The XGBoost model starts from HAR-X&apos;s
              forecast as a base margin and is trained directly on QLIKE, the loss used to evaluate volatility
              forecasts, using 18 features: range-based estimators, downside semivariance, the VIX term structure,
              VVIX, and recent returns and drawdowns.
            </p>
            <p>
              The honest result: HAR-X is very hard to beat. XGBoost&apos;s early stopping keeps a median of only{' '}
              {forecast.rounds.median} trees per refit, and its QLIKE is {num(xgbM.qlike, 3)} against HAR-X&apos;s{' '}
              {num(harx.qlike, 3)}, a difference that is not statistically significant (Diebold-Mariano t ={' '}
              {num(xgbM.dm_vs_harx ?? 0)}). Where XGBoost earns its place is in the trade decision below, not in
              average accuracy.
            </p>
          </Prose>
          <Panel title="Forecast vs realized volatility" note="Weekly samples, annualized vol points. Drag the handles to zoom.">
            <ForecastChart data={forecast.series} />
          </Panel>
          <Table
            head={['Model', 'RMSE', 'Bias', 'R² (log)', 'QLIKE', 'DM vs HAR-X']}
            highlight={2}
            rows={forecast.metrics.map((m) => [
              MODEL_LABELS[m.model],
              num(m.rmse),
              `${m.bias > 0 ? '+' : ''}${num(m.bias)}`,
              num(m.r2_log, 3),
              num(m.qlike, 4),
              m.dm_vs_harx == null ? '—' : num(m.dm_vs_harx),
            ])}
          />
          <p className="text-xs text-neutral-500">
            Lower QLIKE is better. DM is a Diebold-Mariano t-statistic with a Newey-West variance (lag 20, because
            forecast windows overlap); negative means lower loss than HAR-X. VIX over-forecasts by{' '}
            {num(forecast.metrics.find((m) => m.model === 'vix')!.bias, 1)} vol points on average: that bias is the
            premium.
          </p>
          <Panel
            title="What the trees correct for"
            note="Mean absolute SHAP contribution to the XGBoost adjustment on top of HAR-X, from the latest refit."
          >
            <ImportanceChart data={forecast.importance} />
          </Panel>
        </Section>

        <Section id="backtest" label="03 · Backtest" title="Does timing help?">
          <Prose>
            <p>
              Each timing rule sells only when the straddle&apos;s implied vol is above its forecast of realized vol.
              Every rule is fixed in advance (sell when the edge is positive), and none was tuned on the test period.
              The perfect-foresight row uses future realized vol and is shown only as an upper bound.
            </p>
          </Prose>
          <Panel title="Cumulative return" note="Additive daily returns on capital, after costs.">
            <EquityChart data={strategy.equity} labels={strategy.labels} />
          </Panel>
          <Table
            head={['Strategy', 'Return / yr', 'Vol / yr', 'Sharpe', 'Max DD', 'Worst month', 'Skew', 'In market']}
            highlight={3}
            rows={KEYS.map((k) => [
              strategy.labels[k],
              pct(s[k].ann_return, 2),
              pct(s[k].ann_vol, 2),
              num(s[k].sharpe),
              pct(s[k].max_drawdown),
              pct(s[k].worst_month),
              num(s[k].skew, 1),
              pct(s[k].time_in_market, 0),
            ])}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Drawdown">
              <DrawdownChart data={strategy.drawdown} />
            </Panel>
            <Panel title="How often the XGBoost rule sells" note="Monthly share of days with a new short straddle.">
              <ExposureChart data={strategy.exposure} />
            </Panel>
          </div>
          <Prose>
            <p>
              Timing lost less than always-selling in {crashesWon} of {strategy.crashes.length} stress episodes, and
              the gain is concentrated in slow-building crises: when realized volatility has already started climbing,
              the forecast rises above implied and the book stops adding risk, as in late 2008. Shocks that arrive
              out of a calm market, such as Volmageddon or the 2025 tariff shock, give no warning in the data, and
              the timed book loses as much as or more than always-selling.
            </p>
          </Prose>
          <Table
            head={['Episode', 'VIX peak', 'Always sell', 'Trailing rule', 'HAR-X', 'XGBoost', 'Foresight']}
            rows={strategy.crashes.map((r) => [
              r.name,
              num(r.vix_peak, 0),
              pct(r.always, 2),
              pct(r.naive, 2),
              pct(r.harx, 2),
              pct(r.xgb, 2),
              pct(r.oracle, 2),
            ])}
          />
        </Section>

        <Section id="montecarlo" label="04 · Monte Carlo" title="Skill or luck, and what a crash costs">
          <Prose>
            <p>
              A single backtest path is one draw from history. A stationary block bootstrap (mean block{' '}
              {boot.mean_block} days, so volatility clusters stay intact) resamples {boot.draws.toLocaleString()}{' '}
              alternative histories, with every strategy resampled on the same days so they can be compared draw by
              draw. The timed book has a higher Sharpe in {pct(pairedX.prob_beats_always, 0)} of draws, and its Sharpe
              gain has a 95% interval of {num(pairedX.sharpe_diff.lo)} to {num(pairedX.sharpe_diff.hi)}. That interval
              includes zero: the evidence favors timing but does not prove it, and the dashboard says so rather than
              rounding up.
            </p>
          </Prose>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Bootstrap distribution of Sharpe">
              <SharpeHistogram boot={boot} />
            </Panel>
            <Panel
              title="Black-Scholes check"
              note={`One straddle sold at ${pct(stress.implied, 0)} implied, simulated across realized vols. The mean P&L lands on the BS value gap.`}
            >
              <GapCurve data={stress.curve} />
            </Panel>
          </div>
          <Table
            head={['Strategy', 'Sharpe 95% CI', 'Max DD 95% CI', 'P(Sharpe < 0)']}
            highlight={3}
            rows={(['always', 'naive', 'harx', 'xgb'] as const).map((k) => {
              const b = boot.strategies[k];
              return [
                strategy.labels[k],
                `${num(b.sharpe.lo)} – ${num(b.sharpe.hi)}`,
                `${pct(b.max_drawdown.lo)} – ${pct(b.max_drawdown.hi)}`,
                pct(b.prob_negative_sharpe, 1),
              ];
            })}
          />
          <Prose>
            <p>
              The second simulation stresses the trade itself. A short straddle priced at {pct(stress.implied, 0)}{' '}
              implied collects a {pct(stress.premium, 2)} premium. Paths follow a Merton jump-diffusion with{' '}
              {pct(stress.diffusion, 0)} diffusion vol plus crash jumps averaging {pct(stress.jump_mean, 0)}, using the
              same hedging engine as the backtest. A few crashes a year are enough to erase the edge entirely, which
              is why avoiding the worst months matters more than squeezing out average return.
            </p>
          </Prose>
          <Table
            head={['Crash jumps / yr', 'Realized vol', 'Mean P&L', 'Median', '5th pct', '1st pct', 'P(loss)']}
            rows={stress.rows.map((r) => [
              num(r.jumps_per_year, 0),
              pct(r.realized_vol, 1),
              pct(r.mean, 2),
              pct(r.median, 2),
              pct(r.p5, 2),
              pct(r.p1, 2),
              pct(r.prob_loss, 0),
            ])}
          />
          <p className="text-xs text-neutral-500">
            P&amp;L per trade as a share of underlying notional, {stress.paths.toLocaleString()} paths per row.
          </p>
        </Section>

        <Section id="robustness" label="05 · Robustness" title="How much depends on the assumptions">
          <Prose>
            <p>
              VIX is a variance-swap rate that includes the put skew, so an at-the-money straddle trades below it.
              Free daily ATM implied vol history does not exist, so the backtest uses a ratio to VIX. This is the
              assumption the results are most sensitive to, so here is every combination:
            </p>
          </Prose>
          <Table
            head={['ATM vol / VIX', 'Half-spread (vol pts)', 'Sharpe always', 'Sharpe XGBoost', 'Return always', 'Return XGBoost']}
            rows={strategy.costs.map((r) => [
              num(r.atm_ratio),
              num(r.spread_vol_pts, 1),
              num(r.sharpe_always),
              num(r.sharpe_xgb),
              pct(r.return_always, 2),
              pct(r.return_xgb, 2),
            ])}
          />
          <Prose>
            <p>
              Priced at the full VIX level, the premium is so rich that timing changes almost nothing. As the
              premium shrinks toward realistic ATM pricing, skipping the bad months matters more and the gap widens;
              at 0.85 × VIX neither version is worth trading. Below, the threshold for selling varies around the
              pre-registered zero. These were computed after the fact and are shown as a sensitivity check, not a
              choice.
            </p>
          </Prose>
          <Table
            head={['Sell when edge >', 'Sharpe', 'Return / yr', 'Max DD', 'Worst month', 'In market']}
            highlight={2}
            rows={strategy.sensitivity.map((r) => [
              `${r.threshold > 0 ? '+' : ''}${r.threshold} vol pts`,
              num(r.sharpe),
              pct(r.ann_return, 2),
              pct(r.max_drawdown),
              pct(r.worst_month),
              pct(r.time_in_market, 0),
            ])}
          />
        </Section>

        <Section id="method" label="06 · Method" title="How it is built, and what it does not prove">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Pipeline">
              <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-700">
                <li>
                  Free data only: S&amp;P 500 OHLC (Yahoo Finance), VIX, VIX9D, VIX3M and VVIX (Cboe), 3-month T-bill
                  (FRED), {summary.train_start.slice(0, 4)} onward.
                </li>
                <li>
                  Walk-forward: first {forecast.params.min_train / 252} years train only, then refit every{' '}
                  {forecast.params.refit_every} trading days. Training rows are purged {forecast.params.horizon} days
                  plus a {forecast.params.embargo}-day embargo before each forecast window.
                </li>
                <li>
                  Forecasts are √E[RV²] with a lognormal variance correction measured on a purged holdout, so they
                  are on the same scale as VIX and the straddle&apos;s implied vol.
                </li>
                <li>
                  XGBoost uses a custom QLIKE objective with HAR-X as base margin; tree count is chosen by early
                  stopping on the last {pct(forecast.params.holdout, 0)} of each training window.
                </li>
                <li>
                  Vectorized Black-Scholes engine shared by the backtest and the Monte Carlo, with tests for put-call
                  parity, Greeks against finite differences, and hedged P&amp;L against the BS value gap.
                </li>
              </ul>
            </Panel>
            <Panel title="Limitations">
              <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-700">
                <li>
                  Straddles are priced off VIX with a fixed skew discount, not from traded option quotes. Real ATM
                  vol relative to VIX moves over time.
                </li>
                <li>
                  Daily close-to-close hedging ignores intraday gaps and margin calls, which matter most in exactly
                  the crashes shown above.
                </li>
                <li>
                  The rules were fixed in advance, but some design choices (the ATM pricing ratio, training XGBoost
                  on QLIKE) were made after seeing early out-of-sample results, so the test period is not perfectly
                  untouched.
                </li>
                <li>
                  The Sharpe improvement is not significant at 95%. The robust finding is the reduction in tail
                  losses, not higher average returns.
                </li>
                <li>
                  {pct(strategy.hit_rate, 0)} of individual trades make money, but which ones lose is barely
                  predictable: the rank correlation between the XGBoost edge and each trade&apos;s P&amp;L is only{' '}
                  {num(strategy.ic.xgb, 3)}.
                </li>
              </ul>
            </Panel>
          </div>
        </Section>
      </main>

      <footer className="border-t border-neutral-200">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-8 font-mono text-[11px] text-neutral-500">
          <span>Sai Bharadwaj · generated {summary.generated_at.slice(0, 10)}</span>
          <div className="flex gap-5">
            <a href={REPO} target="_blank" rel="noopener noreferrer" className="hover:text-neutral-900">
              Source
            </a>
            <a
              href="https://portfolio-snowy-five-21.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-neutral-900"
            >
              Portfolio
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
