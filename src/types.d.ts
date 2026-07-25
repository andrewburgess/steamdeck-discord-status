declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*.png" {
  const content: string;
  export default content;
}

declare module "*.jpg" {
  const content: string;
  export default content;
}

/** Generated at build time by the `build-info` plugin in rollup.config.js. */
declare module "virtual:build-info" {
  /** The `version` field from package.json. */
  export const VERSION: string;
  /** Short hash of the built bundle, or "" for a release build. */
  export const BUILD_HASH: string;
}
