import { ShowcaseFrame } from "@/components/marketing/showcase-frame";
import { mcpTools } from "@/lib/resolve-data";

export function McpDevelopersShowcase() {
  return (
    <ShowcaseFrame title="Developers" subtitle="MCP + REST" badge="Agent-native">
      <div className="grid sm:grid-cols-2">
        <pre className="border-r border-neutral-100 bg-neutral-950 p-4 text-[10px] leading-relaxed text-emerald-300 overflow-x-auto">
{`{
  "mcpServers": {
    "vetcomply": {
      "url": "https://api.vetcomply.com/mcp"
    }
  }
}`}
        </pre>
        <ul className="divide-y divide-neutral-100 p-2">
          {mcpTools.slice(0, 4).map((tool) => (
            <li key={tool.name} className="px-3 py-2">
              <p className="font-mono text-[11px] font-medium text-neutral-900">{tool.name}</p>
            </li>
          ))}
          <li className="px-3 py-2 text-[11px] text-neutral-400">+2 more tools</li>
        </ul>
      </div>
    </ShowcaseFrame>
  );
}
