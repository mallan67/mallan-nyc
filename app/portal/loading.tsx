export default function PortalLoading() {
  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <div className="max-w-4xl mx-auto px-6 py-16 animate-pulse">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="h-7 w-52 bg-gray-200/80 rounded-lg" />
          <div className="h-4 w-16 bg-gray-100 rounded" />
        </div>
        <div className="h-4 w-36 bg-gray-100 rounded mb-10" />

        {/* Workspace cards */}
        <div className="grid gap-5 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6"
            >
              <div className="h-9 w-9 bg-gray-200/60 rounded-xl mb-3" />
              <div className="h-5 w-32 bg-gray-200/70 rounded mb-2" />
              <div className="h-3 w-full bg-gray-100 rounded mb-1" />
              <div className="h-3 w-2/3 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
