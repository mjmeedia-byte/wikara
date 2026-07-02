/// <reference types="vite/client" />
/// <reference types="chrome" />

// Lets us import a stylesheet as a plain string, e.g.
//   import styles from './sidebar.css?inline';
declare module '*.css?inline' {
  const css: string;
  export default css;
}
