/** Os cinco projetos do latam-tools.com.br, na ordem em que aparecem nos filtros. */
export const PROJETOS = {
  mercado: {
    nome: "Mercado",
    descricao: "Preços e ofertas do mercado de jogadores",
    url: "https://mercado.latam-tools.com.br",
    cor: "#3fa96c",
  },
  simulador: {
    nome: "Simulador",
    descricao: "Simulador de dano",
    url: "https://simulador.latam-tools.com.br",
    cor: "#d1683f",
  },
  recap: {
    nome: "Recap",
    descricao: "Leitor de replays",
    url: "https://recap.latam-tools.com.br",
    cor: "#7a5fd1",
  },
  visuais: {
    nome: "Visuais",
    descricao: "Simulador de visuais",
    url: "https://visuais.latam-tools.com.br",
    cor: "#3f6cd1",
  },
  calc: {
    nome: "Calculadoras",
    descricao: "Diadema, EXP, martelo e memorável",
    url: "https://calc.latam-tools.com.br",
    cor: "#c9a227",
  },
} as const;

export type Projeto = keyof typeof PROJETOS;

export const SLUGS_PROJETO = Object.keys(PROJETOS) as Projeto[];

export function isProjeto(valor: unknown): valor is Projeto {
  return typeof valor === "string" && valor in PROJETOS;
}

/**
 * Um `?projeto=` desconhecido cai no quadro inteiro em vez de 404: o link vem de
 * fora, de sites que a gente atualiza em outro momento, e derrubar a página por
 * causa de um slug velho seria pior do que mostrar tudo.
 */
export function parseProjeto(valor: string | null): Projeto | null {
  return isProjeto(valor) ? valor : null;
}
