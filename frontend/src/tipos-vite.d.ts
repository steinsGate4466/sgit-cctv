/* Bloque 184 · Vite sirve un archivo como URL con el sufijo `?url` (el
   trabajador de pdf.js). TypeScript no lo sabe sin esta declaración. */
declare module '*?url' {
  const url: string;
  export default url;
}
