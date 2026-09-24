/**
 * Contrato genérico de canal. O núcleo do concierge (src/lib/concierge/*)
 * só conhece esta interface — nunca fala com a Z-API (ou qualquer outra
 * plataforma) diretamente. Isso é o que permite trocar de instância Z-API
 * ou até de canal (Instagram oficial, ManyChat, etc.) no futuro só
 * escrevendo uma nova implementação de ChannelConnector, sem tocar no
 * resto do sistema.
 */

export interface IncomingMessage {
  channel: "zapi-whatsapp" | string;
  /** Identificador do chat/conversa no canal (ex: número de telefone) */
  chatId: string;
  /** Identificador único da mensagem, usado para dedupe */
  messageId: string;
  /** true se a mensagem foi enviada pelo próprio número do bot (evitar loop) */
  fromMe: boolean;
  text?: string;
  /** URL da imagem, se houver (a mídia em si é buscada por essa URL) */
  imageUrl?: string;
  timestamp: number;
}

export interface OutgoingMessage {
  chatId: string;
  text: string;
}

export interface OutgoingImageMessage {
  chatId: string;
  imageUrl: string;
  /** Legenda da imagem — a Z-API (e o WhatsApp) mostra junto com a foto */
  caption?: string;
}

/**
 * Mensagem de texto + card de prévia de link nativo do WhatsApp (o mesmo
 * card que aparece quando você cola um link manualmente) — bem mais leve
 * que mandar a foto como mídia anexada, que obriga o destinatário a
 * baixar pra ver em qualidade real.
 */
export interface OutgoingLinkMessage {
  chatId: string;
  /** Texto da mensagem — precisa terminar com o mesmo valor de linkUrl */
  message: string;
  /** URL da imagem usada como thumbnail do card (compactada pelo canal) */
  imageUrl: string;
  linkUrl: string;
  title: string;
  linkDescription: string;
  /** Tamanho do card de prévia. Default do canal: o menor disponível. */
  linkSize?: "small" | "medium" | "large";
}

export interface ChannelConnector {
  readonly name: string;
  /** Converte o payload bruto do webhook do canal em IncomingMessage normalizado */
  parseIncoming(rawBody: unknown): IncomingMessage | null;
  /** Envia uma resposta de texto para o chat */
  sendText(msg: OutgoingMessage): Promise<void>;
  /** Envia uma imagem (com legenda opcional) — usado pra mandar a foto do produto */
  sendImage(msg: OutgoingImageMessage): Promise<void>;
  /** Envia texto com card de prévia de link nativo (thumbnail leve, sem anexar mídia) */
  sendLink(msg: OutgoingLinkMessage): Promise<void>;
}
