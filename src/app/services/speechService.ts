/**
 * Speech Service — Wraps the browser's free Web Speech API.
 * All service calls in /services/ for easy migration.
 */

export interface SpeechServiceConfig {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

export function isSpeechRecognitionSupported(): boolean {
  return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export function isSpeechSynthesisSupported(): boolean {
  return !!(window.speechSynthesis);
}

let recognitionInstance: any = null;

export function startListening(config: SpeechServiceConfig = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!isSpeechRecognitionSupported()) {
      reject(new Error("Speech recognition is not supported in this browser."));
      return;
    }
    stopListening();
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionInstance = recognition;
    recognition.lang = config.language || "en-US";
    recognition.continuous = config.continuous ?? false;
    recognition.interimResults = config.interimResults ?? false;
    recognition.maxAlternatives = 1;
    let finalTranscript = "";
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + " ";
      }
    };
    recognition.onend = () => { recognitionInstance = null; resolve(finalTranscript.trim()); };
    recognition.onerror = (event: any) => {
      recognitionInstance = null;
      if (event.error === "no-speech") resolve("");
      else if (event.error === "not-allowed") reject(new Error("Microphone access denied."));
      else reject(new Error(`Speech recognition error: ${event.error}`));
    };
    try { recognition.start(); } catch (err) { recognitionInstance = null; reject(err); }
  });
}

export function stopListening(): void {
  if (recognitionInstance) { try { recognitionInstance.stop(); } catch { /* noop */ } recognitionInstance = null; }
}

export function isListening(): boolean { return recognitionInstance !== null; }

export function speak(text: string, options: { language?: string; rate?: number; pitch?: number; volume?: number; onEnd?: () => void } = {}): void {
  if (!isSpeechSynthesisSupported()) { options.onEnd?.(); return; }
  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = options.language || "en-US";
  utterance.rate = options.rate ?? 0.9;
  utterance.pitch = options.pitch ?? 1;
  utterance.volume = options.volume ?? 1;
  const voices = window.speechSynthesis.getVoices();
  const langPrefix = utterance.lang.split("-")[0];
  const matchingVoice = voices.find((v) => v.lang.startsWith(langPrefix));
  if (matchingVoice) utterance.voice = matchingVoice;
  utterance.onend = () => { options.onEnd?.(); };
  utterance.onerror = () => { options.onEnd?.(); };
  window.speechSynthesis.speak(utterance);
}

export function speakArabic(text: string, onEnd?: () => void): void {
  speak(text, { language: "ar-SA", rate: 0.8, onEnd });
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  return isSpeechSynthesisSupported() && window.speechSynthesis.speaking;
}

export function pronounceWord(arabic: string): void { speakArabic(arabic); }
