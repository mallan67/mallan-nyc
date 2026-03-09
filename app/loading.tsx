export default function RootLoading() {
  return (
    <div className="min-h-screen pt-20 px-4">
      <div className="max-w-7xl mx-auto animate-pulse">
        <div className="h-8 bg-gray-100 rounded-lg w-1/3 mb-6" />
        <div className="h-4 bg-gray-100 rounded w-2/3 mb-4" />
        <div className="h-4 bg-gray-100 rounded w-1/2 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl overflow-hidden">
              <div className="aspect-[4/3] bg-gray-100" />
              <div className="p-4 space-y-2">
                <div className="h-5 bg-gray-100 rounded w-1/2" />
                <div className="h-4 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
