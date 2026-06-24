export function ProductPreview() {
  return (
    <div className="relative mx-auto mt-16 max-w-4xl">
      <div className="absolute -inset-4 rounded-2xl bg-gradient-to-b from-neutral-200/60 to-transparent blur-2xl" />
      <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl shadow-neutral-200/50">
        <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
          </div>
          <span className="ml-2 text-xs text-neutral-400">vetcomply.app/demo</span>
        </div>
        <div className="flex min-h-[280px]">
          <div className="hidden w-44 shrink-0 border-r border-neutral-100 bg-neutral-950 p-4 sm:block">
            <div className="h-2 w-20 rounded bg-neutral-700" />
            <div className="mt-6 space-y-2">
              <div className="h-2 w-24 rounded bg-teal-500/30" />
              <div className="h-2 w-20 rounded bg-neutral-800" />
              <div className="h-2 w-20 rounded bg-neutral-800" />
              <div className="h-2 w-16 rounded bg-neutral-800" />
            </div>
          </div>
          <div className="flex-1 p-5 sm:p-6">
            <div className="h-2.5 w-32 rounded bg-neutral-200" />
            <div className="mt-2 h-2 w-48 rounded bg-neutral-100" />
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {["98", "21", "8", "34"].map((val) => (
                <div
                  key={val}
                  className="rounded-lg border border-neutral-100 bg-neutral-50 p-3"
                >
                  <div className="text-lg font-semibold text-neutral-900">{val}</div>
                  <div className="mt-1 h-1.5 w-12 rounded bg-neutral-200" />
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-neutral-100 bg-neutral-50 p-4">
              <div className="h-2 w-28 rounded bg-neutral-200" />
              <div className="mt-3 space-y-2">
                <div className="h-2 w-full rounded bg-neutral-100" />
                <div className="h-2 w-4/5 rounded bg-neutral-100" />
                <div className="h-2 w-3/5 max-w-[60%] rounded bg-teal-100" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
