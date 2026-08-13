import type { ParameterSweep } from "@/lib/artifacts";
import { num } from "@/lib/format";

/**
 * Plain CSS-grid heatmap: no chart library, no client JavaScript. The colour ramp is a
 * single hue by intensity rather than a rainbow, so the eye reads level rather than
 * category, and a broad plateau stays visually distinguishable from a lone spike.
 */
export default function Heatmap({ sweep }: { sweep: ParameterSweep }) {
  const values = sweep.cells.map((c) => c.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;

  const lookup = new Map(sweep.cells.map((c) => [`${c.x}|${c.y}`, c]));

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-[13px]">
        <caption className="caption-bottom pt-3 text-left text-[13px] text-muted">
          {sweep.metric} across {sweep.x_label.toLowerCase()} and {sweep.y_label.toLowerCase()}.
          Darker is higher.
        </caption>
        <thead>
          <tr>
            <th className="px-2 py-1 text-left text-[11px] uppercase tracking-[0.1em] text-muted">
              {sweep.y_param} \ {sweep.x_param}
            </th>
            {sweep.x_values.map((x) => (
              <th
                key={x}
                scope="col"
                className="tnum px-2 py-1 text-right text-[11px] font-medium text-muted"
              >
                {x}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...sweep.y_values].reverse().map((y) => (
            <tr key={y}>
              <th
                scope="row"
                className="tnum px-2 py-1 text-right text-[11px] font-medium text-muted"
              >
                {y}
              </th>
              {sweep.x_values.map((x) => {
                const cell = lookup.get(`${x}|${y}`);
                if (!cell) {
                  return <td key={x} className="border border-rule bg-paper px-3 py-2" />;
                }
                const intensity = (cell.value - lo) / span;
                const alpha = 0.08 + 0.72 * intensity;
                return (
                  <td
                    key={x}
                    className="tnum border border-rule px-3 py-2 text-right"
                    style={{
                      backgroundColor: `rgba(31, 77, 143, ${alpha.toFixed(3)})`,
                      color: intensity > 0.62 ? "#ffffff" : "#16181d",
                    }}
                    title={
                      cell.t_stat === null
                        ? `${sweep.metric} ${num(cell.value, 2)}`
                        : `${sweep.metric} ${num(cell.value, 2)}, t = ${num(cell.t_stat, 2)}`
                    }
                  >
                    {num(cell.value, 2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
