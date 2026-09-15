(() => {
  if (globalThis.HKP_DEFAULTS) return;

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  const BUTTONS = [
    { label: 'Next topic', prompt: "Let's move on to the next topic." },
    { label: 'Explain again', prompt: 'Explain that last topic again in a simpler way, using a different approach than before.' },
    { label: 'Give an example', prompt: 'Give me a concrete, worked example of what you just explained.' },
    { label: 'Quiz me', prompt: 'Quiz me on what we just covered. Ask one question at a time and wait for my answer before giving feedback.' },
    { label: 'Summarize', prompt: 'Summarize everything we have covered so far as short study notes.' },
    { label: 'Go deeper', prompt: 'Go deeper on that last point. Cover the details and edge cases I would need to know for an exam.' },
    { label: 'Explain this', prompt: 'Explain this in simple terms:' },
    { label: 'Improve prompt', prompt: 'Rewrite the prompt below so it is clearer, more specific, and more effective for an AI assistant. Keep my original goal. Reply with only the improved prompt.' },
    { label: 'Fix grammar', prompt: 'Fix only the grammar, spelling, and punctuation in the text below. Keep my wording, tone, and meaning as close to the original as possible. Reply with only the corrected text.' }
  ];

  globalThis.HKP_DEFAULTS = {
    uid,
    makeButtons: () => BUTTONS.map((b) => ({ id: uid(), ...b })),
    settings: {
      panelVisible: true,
      pasteMode: false,
      pasteKey: { code: 'Tab', label: 'Tab', shift: false },
      pasteTemplate: '{clipboard}',
      buttonMode: 'send',
      numberHotkeys: true
    }
  };
})();
