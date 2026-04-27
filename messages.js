class Messages {
  messages = {
    "0": "❌ Opção inválida. Digite \"menu\" para ver as opções novamente.",

    "1": `🕒 Nosso horário de atendimento:
Segunda a sexta: 07h às 17h

Se o caso for urgente, informe a situação e eu encaminharei para análise do advogado.`,

    "2": "👨‍⚖️ Certo. Sou Bella, vou iniciar uma triagem rápida para entender seu caso e encaminhar ao advogado Rodrigo Marinho. Como posso te ajudar hoje?",

    "3": `💼 Áreas atendidas:
- Direito do consumidor
- Família
- Trabalhista
- Cível
- Previdenciário
- Criminal
- Empresarial
- Imobiliário

Digite 2 para iniciar a triagem com o assistente jurídico.`,

    "4": "📍 Atendimento mediante agendamento. Informe sua cidade e o tipo de caso para verificarmos a melhor forma de atendimento.",

    "5": "💳 As formas de pagamento são informadas pelo escritório após análise inicial do caso.",

    "6": "📩 Para assuntos profissionais, envie sua mensagem e ela será encaminhada ao responsável.",

    "7": "✅ Atendimento automático reativado para este número.",

    "8": "✅ Atendimento encerrado. Digite \"menu\" se precisar iniciar novamente.",

    "10": `👋 Olá! Eu sou a Bella, atendente do escritório Rodrigo Marinho.

1️⃣ - Ver horário de atendimento
2️⃣ - Fazer triagem jurídica
3️⃣ - Ver áreas de atuação
4️⃣ - Ver localização/agendamento
5️⃣ - Formas de pagamento
6️⃣ - Assuntos profissionais

Digite a opção desejada:`
  };

  getMessage(index = 0) {
    return this.messages[index.toString()] ?? this.messages["0"];
  }
}

module.exports = new Messages();