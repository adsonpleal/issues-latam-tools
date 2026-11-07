/**
 * The five latam-tools.com.br projects, in the order they appear in the
 * filters.
 *
 * The keys are the `projeto` values stored on a card, so they keep the spelling
 * the database uses. The labels are read by visitors and stay in Portuguese.
 */
export const PROJECTS = {
  mercado: {
    name: "Mercado",
    description: "Preços e ofertas do mercado de jogadores",
    url: "https://mercado.latam-tools.com.br",
    color: "#3fa96c",
  },
  simulador: {
    name: "Simulador",
    description: "Simulador de dano",
    url: "https://simulador.latam-tools.com.br",
    color: "#d1683f",
  },
  recap: {
    name: "Recap",
    description: "Leitor de replays",
    url: "https://recap.latam-tools.com.br",
    color: "#7a5fd1",
  },
  visuais: {
    name: "Visuais",
    description: "Simulador de visuais",
    url: "https://visuais.latam-tools.com.br",
    color: "#3f6cd1",
  },
  calc: {
    name: "Calculadoras",
    description: "Diadema, EXP, martelo e memorável",
    url: "https://calc.latam-tools.com.br",
    color: "#c9a227",
  },
} as const;

export type Project = keyof typeof PROJECTS;

export const PROJECT_SLUGS = Object.keys(PROJECTS) as Project[];

export function isProject(value: unknown): value is Project {
  return typeof value === "string" && value in PROJECTS;
}

/**
 * An unknown `?projeto=` falls back to the whole board rather than a 404: the
 * link comes from outside, from sites we update at some other time, and taking
 * the page down over a stale slug would be worse than showing everything.
 */
export function parseProject(value: string | null): Project | null {
  return isProject(value) ? value : null;
}
