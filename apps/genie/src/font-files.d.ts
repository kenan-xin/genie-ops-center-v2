/** A font file the build emits. The default export is its served URL (`turbopack.rules`). */
declare module "*.woff2?url" {
  const href: string;
  export default href;
}
