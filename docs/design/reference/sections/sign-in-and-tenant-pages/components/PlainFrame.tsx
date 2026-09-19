/**
 * Standalone neutral-gray surface for pages that render before tenant branding can be trusted
 * (not set up yet) or before a session is complete (limited session). Product name only, no logo, no tenant colors.
 */
export function PlainFrame({ productName, children }: { productName: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gray-100 px-4 py-10 font-[Plus_Jakarta_Sans] text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100">
      <div className="flex w-full max-w-[440px] flex-col items-center">
        <span className="mb-6 text-sm font-semibold tracking-tight text-gray-600 dark:text-gray-400">{productName}</span>
        <div className="w-full rounded-xl border border-gray-200 bg-white p-7 sm:p-8 dark:border-gray-800 dark:bg-gray-900">{children}</div>
      </div>
    </div>
  )
}
