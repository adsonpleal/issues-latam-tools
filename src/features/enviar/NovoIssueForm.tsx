import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { LABEL_TIPO, t } from "../../i18n";
import {
  AUTOR_MAX,
  CONTATO_MAX,
  DESCRICAO_MAX,
  TITULO_MAX,
  type AnexoPronto,
} from "../../lib/issues";
import { PROJETOS, SLUGS_PROJETO, parseProjeto, type Projeto } from "../../lib/projetos";
import { TIPOS, type Tipo } from "../../lib/status";
import { CampoAnexos } from "./CampoAnexos";
import { useEnviarIssue } from "./useEnviarIssue";

export function NovoIssueForm() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { estado, mensagemErro, enviar } = useEnviarIssue();

  // O projeto vem pré-selecionado do link "Reportar" do site de origem.
  const [projeto, setProjeto] = useState<Projeto>(parseProjeto(params.get("projeto")) ?? "simulador");
  const [tipo, setTipo] = useState<Tipo>("bug");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [autor, setAutor] = useState("");
  const [contato, setContato] = useState("");
  const [anexos, setAnexos] = useState<AnexoPronto[]>([]);
  const [isca, setIsca] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const id = await enviar({ projeto, tipo, titulo, descricao, autor, contato, anexos, isca });
    if (id) navigate(`/t/${id}?novo=1`);
  }

  return (
    <form className="formulario" onSubmit={onSubmit}>
      <div className="campo">
        <label htmlFor="projeto">{t.campoProjeto}</label>
        <select
          id="projeto"
          value={projeto}
          onChange={(e) => setProjeto(e.target.value as Projeto)}
          required
        >
          {SLUGS_PROJETO.map((slug) => (
            <option key={slug} value={slug}>
              {PROJETOS[slug].nome} — {PROJETOS[slug].descricao}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="campo campo-radio">
        <legend>{t.campoTipo}</legend>
        {/* Os rádios ficam numa div própria: o fieldset herda o
            `flex-direction: column` de `.campo`, e é a linha que precisa ser
            horizontal, não a legenda junto com eles. */}
        <div className="radio-linha">
          {TIPOS.map((tp) => (
            <label key={tp} className="radio">
              <input
                type="radio"
                name="tipo"
                value={tp}
                checked={tipo === tp}
                onChange={() => setTipo(tp)}
              />
              {LABEL_TIPO[tp]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="campo">
        <label htmlFor="titulo">{t.campoTituloLabel}</label>
        <input
          id="titulo"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder={t.campoTituloPlaceholder}
          maxLength={TITULO_MAX}
          required
          minLength={3}
        />
      </div>

      <div className="campo">
        <label htmlFor="descricao">{t.campoDescricao}</label>
        <textarea
          id="descricao"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder={t.campoDescricaoPlaceholder}
          maxLength={DESCRICAO_MAX}
          rows={7}
        />
      </div>

      <CampoAnexos anexos={anexos} onChange={setAnexos} />

      <div className="campo">
        <label htmlFor="autor">{t.campoAutor}</label>
        <input
          id="autor"
          value={autor}
          onChange={(e) => setAutor(e.target.value)}
          maxLength={AUTOR_MAX}
          aria-describedby="ajuda-autor"
        />
        <p className="campo-ajuda" id="ajuda-autor">
          {t.campoAutorAjuda}
        </p>
      </div>

      <div className="campo">
        <label htmlFor="contato">{t.campoContato}</label>
        <input
          id="contato"
          value={contato}
          onChange={(e) => setContato(e.target.value)}
          maxLength={CONTATO_MAX}
          aria-describedby="ajuda-contato"
        />
        <p className="campo-ajuda" id="ajuda-contato">
          {t.campoContatoAjuda}
        </p>
      </div>

      {/* Campo-isca: invisível e fora da ordem de tabulação, então gente nunca
          preenche. Robô que preenche formulário por atacado preenche. */}
      <div className="isca" aria-hidden="true">
        <label htmlFor="website">Não preencha este campo</label>
        <input
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={isca}
          onChange={(e) => setIsca(e.target.value)}
        />
      </div>

      {mensagemErro && <p className="aviso aviso-erro">{mensagemErro}</p>}

      <div className="formulario-acoes">
        <button type="submit" className="botao botao-primario" disabled={estado === "enviando"}>
          {estado === "enviando" ? t.enviando : t.enviar}
        </button>
      </div>
    </form>
  );
}
