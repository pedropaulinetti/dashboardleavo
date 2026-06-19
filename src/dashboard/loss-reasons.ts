// Motivos de perda conhecidos, em ordem de exibição, com cor por motivo.
// Espelha `lossDefs` do mockup "Funil de Vendas.dc.html" (~386-392).
// As strings de `reason` devem bater EXATAMENTE com o que o seed grava em leads.lostReason.
export const LOSS_REASONS = [
  { reason: 'Preço / orçamento', color: 'hsl(359 99% 57%)' },
  { reason: 'Sumiu / sem retorno', color: 'hsl(24 94% 57%)' },
  { reason: 'Escolheu concorrente', color: 'hsl(38 92% 58%)' },
  { reason: 'Sem fit / não qualificado', color: 'hsl(215 16% 55%)' },
  { reason: 'Timing / adiou decisão', color: 'hsl(214 18% 80%)' },
] as const
