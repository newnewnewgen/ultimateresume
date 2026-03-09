export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">
            AI Resume Writer
          </h1>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
