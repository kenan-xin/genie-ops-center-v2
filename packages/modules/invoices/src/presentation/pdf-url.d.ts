/** A PDF a story imports with `?no-inline`, which the bundler serves as a file, as its URL. */
declare module "*.pdf?no-inline" {
  const url: string;
  export default url;
}
