<section id="home" className="relative">
  <div className="relative h-[54vh] md:h-[62vh]">
    {/* Use your uploaded hero photo; fallback to a luxe NYC interior if hero.jpg isn't there yet */}
    <img
      src="/hero.jpg"
      onError={(e) => ((e.currentTarget.src =
        'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=2000&q=80&auto=format&fit=crop'))}
      alt="Luxury Manhattan living room with skyline view"
      className="w-full h-full object-cover"
    />
    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

    {/* Centered search card */}
    <div className="absolute inset-0 flex items-center justify-center px-4">
      <div className="w-full max-w-3xl">
        <div className="rounded-3xl bg-white/80 backdrop-blur ring-1 ring-black/5 shadow-2xl px-4 py-4 md:px-6 md:py-6">
          <FilterBar onApply={setFilters} />
        </div>
      </div>
    </div>
  </div>
</section>
