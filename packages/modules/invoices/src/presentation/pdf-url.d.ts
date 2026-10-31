/** A PDF a story imports with `?url`, which the bundler serves and answers with its URL. */
declare module "*.pdf?url" {
  const url: string;
  export default url;
}
