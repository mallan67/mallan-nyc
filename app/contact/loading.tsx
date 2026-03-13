export default function ContactLoading() {
  return (
    <div className="min-h-screen pt-20 px-4">
      <div className="max-w-2xl mx-auto animate-pulse">
        <div className="h-8 bg-gray-100 rounded-lg w-40 mb-4" />
        <div className="h-4 bg-gray-100 rounded w-80 mb-8" />
        <div className="space-y-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="h-4 bg-gray-100 rounded w-24 mb-2" />
              <div className="h-10 bg-gray-50 rounded-lg w-full" />
            </div>
          ))}
          <div className="h-12 bg-gray-100 rounded-lg w-40" />
        </div>
      </div>
    </div>
  );
}
