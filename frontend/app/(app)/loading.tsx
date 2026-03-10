export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-48 bg-zinc-100 rounded-lg mb-3" />
      <div className="h-4 w-72 bg-zinc-100 rounded mb-8" />
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-zinc-100 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
