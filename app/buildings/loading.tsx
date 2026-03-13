export default function BuildingsLoading() {
  return (
    <div className="min-h-screen pt-20 px-4">
      <div className="max-w-7xl mx-auto animate-pulse">
        <div className="h-8 bg-gray-100 rounded-lg w-64 mb-4" />
        <div className="h-4 bg-gray-100 rounded w-48 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="aspect-[16/9] bg-gray-100 rounded-2xl" />
            <div className="space-y-3">
              <div className="h-5 bg-gray-100 rounded w-3/4" />
              <div className="h-4 bg-gray-50 rounded w-full" />
              <div className="h-4 bg-gray-50 rounded w-2/3" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-40 bg-gray-50 rounded-xl" />
            <div className="h-40 bg-gray-50 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
