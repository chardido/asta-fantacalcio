// Questo pacchetto e' l'unico punto che conosce le sorgenti concrete;
// il resto del sistema dipende dalle interfacce e dai DTO di @asta/contracts.

export * from "./adattatore-listone-file-locale.js";
export * from "./adattatore-listone-quotazioni-ufficiali.js";
export * from "./adattatore-statistiche-api-football.js";
export * from "./sorgenti.js";

export const ADAPTERS_PACKAGE_NAME = "@asta/adapters";
