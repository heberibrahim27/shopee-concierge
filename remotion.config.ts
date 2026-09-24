import { Config } from "@remotion/cli/config";

// Pasta própria (remotion/public), separada da public/ do Next.js —
// a public/ do Next é servida direto no site ao vivo, não pode virar
// depósito de asset de vídeo em produção.
Config.setPublicDir("remotion/public");
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
