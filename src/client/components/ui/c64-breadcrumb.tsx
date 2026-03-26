interface C64BreadcrumbProps {
  path: string;
  onNavigate: (path: string) => void;
}

/** Parse a path like "/USB0/Games/" into segments with cumulative paths */
function parseSegments(path: string): Array<{ label: string; path: string }> {
  const parts = path.split("/").filter(Boolean);
  const segments: Array<{ label: string; path: string }> = [
    { label: "/", path: "/" },
  ];
  let cumulative = "/";
  for (const part of parts) {
    cumulative += part + "/";
    segments.push({ label: part, path: cumulative });
  }
  return segments;
}

export function C64Breadcrumb({ path, onNavigate }: C64BreadcrumbProps) {
  const segments = parseSegments(path);

  return (
    <div className="flex flex-wrap gap-[0.5ch]">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={seg.path} className="flex items-center">
            {i > 0 && <span className="text-c64-15-light-grey">{">"}</span>}
            {isLast ? (
              <span className="bg-c64-14-light-blue text-c64-6-blue px-[0.5ch]">
                {seg.label.toUpperCase()}
              </span>
            ) : (
              <button
                type="button"
                className="c64-button px-[0.5ch] py-0"
                onClick={() => onNavigate(seg.path)}
              >
                {seg.label.toUpperCase()}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
