import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fixa a raiz do projeto: sem isso, um package-lock.json perdido na pasta home
  // faz o Turbopack inferir a home como raiz do workspace e travar/varrer demais.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
