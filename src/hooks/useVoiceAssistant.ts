import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getLanguageOption,
  getVoiceGender,
  type LanguageCode,
  type VoiceName,
} from '../lib/opportunities';

interface UseVoiceAssistantOptions {
  voiceName: VoiceName;
  preferredLanguage: LanguageCode;
  onTranscriptReady: (transcript: string, isAutoSend: boolean) => void;
  onError?: (message: string) => void;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [altIndex: number]: { transcript: string };
    };
  };
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export function useVoiceAssistant({
  voiceName,
  preferredLanguage,
  onTranscriptReady,
  onError,
}: UseVoiceAssistantOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loadingSpeechId, setLoadingSpeechId] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const autoSendFlagRef = useRef<boolean>(false);
  const finalTranscriptRef = useRef<string>('');
  const ttsCacheRef = useRef<Map<string, string>>(new Map());

  const stopMediaStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingId(null);
    setLoadingSpeechId(null);
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore stop errors
      }
    }
  }, []);

  const startGeminiRecorder = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        onError?.('Microphone access is not supported in this browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsListening(false);
        stopMediaStream();

        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        if (blob.size < 400) {
          setInterimText('');
          return;
        }

        setIsTranscribing(true);
        setInterimText('Transcribing voice command...');
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = typeof reader.result === 'string' ? reader.result : '';
              const commaIndex = result.indexOf(',');
              resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const response = await fetch('/api/audio/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: base64,
              mimeType: mimeType.split(';')[0],
              preferredLanguage,
            }),
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Voice transcription failed.');
          }
          const text = (data.transcript || '').trim();
          setInterimText('');
          if (text) {
            onTranscriptReady(text, autoSendFlagRef.current);
          } else {
            onError?.('Could not hear clear speech. Please try speaking again.');
          }
        } catch (err) {
          setInterimText('');
          onError?.(err instanceof Error ? err.message : 'Voice transcription failed.');
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      setIsListening(true);
      setInterimText('Listening via Gemini Voice...');
    } catch (err) {
      stopMediaStream();
      setIsListening(false);
      onError?.(
        err instanceof Error
          ? err.message
          : 'Microphone permission denied. Please allow mic access.'
      );
    }
  }, [onError, onTranscriptReady, preferredLanguage, stopMediaStream]);

  const startListening = useCallback(
    (autoSend = true) => {
      stopSpeaking();
      autoSendFlagRef.current = autoSend;
      finalTranscriptRef.current = '';

      const win = window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      };
      const SpeechRecognitionCtor =
        win.SpeechRecognition || win.webkitSpeechRecognition;

      if (!SpeechRecognitionCtor) {
        void startGeminiRecorder();
        return;
      }

      try {
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = getLanguageOption(preferredLanguage).speechLang;
        recognition.interimResults = true;
        recognition.continuous = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
          let interim = '';
          let finalChunk = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            const phrase = res[0]?.transcript || '';
            if (res.isFinal) {
              finalChunk += phrase + ' ';
            } else {
              interim += phrase;
            }
          }
          if (finalChunk) {
            finalTranscriptRef.current = (
              finalTranscriptRef.current +
              ' ' +
              finalChunk
            ).trim();
          }
          setInterimText(
            (finalTranscriptRef.current + (interim ? ' ' + interim : '')).trim()
          );
        };

        recognition.onerror = (event) => {
          recognitionRef.current = null;
          setIsListening(false);
          setInterimText('');
          if (event.error === 'network' || event.error === 'service-not-allowed') {
            // Seamlessly fall back to MediaRecorder + Gemini Transcribe
            void startGeminiRecorder();
          } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
            onError?.(`Voice input error: ${event.error}`);
          }
        };

        recognition.onend = () => {
          recognitionRef.current = null;
          setIsListening(false);
          const finalText = finalTranscriptRef.current.trim();
          setInterimText('');
          if (finalText) {
            onTranscriptReady(finalText, autoSendFlagRef.current);
          }
        };

        recognitionRef.current = recognition;
        setIsListening(true);
        setInterimText('Listening...');
        recognition.start();
      } catch {
        void startGeminiRecorder();
      }
    },
    [onError, onTranscriptReady, preferredLanguage, startGeminiRecorder, stopSpeaking]
  );

  const loadBrowserVoices = useCallback((): Promise<SpeechSynthesisVoice[]> => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return Promise.resolve([]);
    }
    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) return Promise.resolve(existing);

    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.speechSynthesis.removeEventListener?.('voiceschanged', onVoices);
        resolve(window.speechSynthesis.getVoices());
      };
      const onVoices = () => done();
      window.speechSynthesis.addEventListener?.('voiceschanged', onVoices);
      setTimeout(done, 350);
    });
  }, []);

  const speakWithBrowserFallback = useCallback(
    async (messageId: string, text: string, targetVoice: VoiceName) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        onError?.('Voice playback could not start.');
        return;
      }

      const clean = text
        .replace(/```[\s\S]*?```/g, ' Code snippet omitted. ')
        .replace(/[#*_`>~]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!clean) return;

      const gender = getVoiceGender(targetVoice);
      const langOption = getLanguageOption(preferredLanguage);
      const langPrefix = langOption.speechLang.split('-')[0].toLowerCase();
      const voices = await loadBrowserVoices();

      const femaleHints =
        /\b(female|woman|girl|samantha|victoria|karen|zira|hazel|susan|veena|heera|lekha|kalpana|aria|jenny|natasha|sara|neerja|swara|aditi|raveena|sonia|libby|clara|ava|allison|kate|serena|tessa|moira|fiona|monica|paulina|amelie|alice|anna|ellen|laura|melina|milena|nora|yuna|kyoko|tingting|meijia|sinji|carmit|damayanti|ioana|kanya|luciana|mariska|miren|monika|nicole|satu|tarja|zosia)\b|google us english|google uk english female|google हिन्दी|google hindi|google english \(india\)|hi-in-x-hia|hi-in-x-hic|en-in-x-ena|en-in-x-enc|en-us-x-sfg|en-us-x-tpc|en-gb-x-gba|en-gb-x-gbc/i;

      const maleHints =
        /\b(male|man|boy|daniel|alex|david|mark|george|oliver|arthur|rishi|hemant|ravi|prabhat|madhur|guy|ryan|andrew|brian|christopher|eric|steffan|roger|liam|william|thomas|connor|aaron|albert|fred|junior|ralph|reed|rocko|eddy|grandpa|jorge|juan|diego|carlos|luca|maged|tarik|xander|yuri|otoya|nicolas|martin|henrik|oskar)\b|google uk english male|hi-in-x-hid|hi-in-x-hie|en-in-x-end|en-in-x-ene|en-us-x-iom|en-us-x-tpd|en-us-x-iol|en-gb-x-gbd|en-gb-x-rjs/i;

      const isMaleVoice = (v: SpeechSynthesisVoice) =>
        maleHints.test(v.name) && !femaleHints.test(v.name);
      const isFemaleVoice = (v: SpeechSynthesisVoice) =>
        femaleHints.test(v.name) && !maleHints.test(v.name);

      const hasNonLatinScript =
        /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B80-\u0BFF\u0C00-\u0C7F\u0600-\u06FF]/.test(
          clean
        );

      const langVoices = voices.filter((v) =>
        v.lang.toLowerCase().startsWith(langPrefix)
      );
      const indianVoices = voices.filter((v) => {
        const l = v.lang.toLowerCase();
        return l.startsWith('hi') || l.startsWith('en-in');
      });
      const englishVoices = voices.filter((v) =>
        v.lang.toLowerCase().startsWith('en')
      );

      let matchedVoice: SpeechSynthesisVoice | undefined;
      if (voices.length > 0) {
        if (gender === 'boy') {
          matchedVoice =
            langVoices.find(isMaleVoice) ||
            indianVoices.find(isMaleVoice) ||
            (!hasNonLatinScript ? englishVoices.find(isMaleVoice) : undefined) ||
            (!hasNonLatinScript ? voices.find(isMaleVoice) : undefined) ||
            langVoices.find((v) => !isFemaleVoice(v)) ||
            langVoices[0] ||
            voices.find(isMaleVoice) ||
            voices[0];
        } else {
          matchedVoice =
            langVoices.find(isFemaleVoice) ||
            langVoices.find((v) => !isMaleVoice(v)) ||
            langVoices[0] ||
            voices.find(isFemaleVoice) ||
            voices[0];
        }
      }

      const utterance = new SpeechSynthesisUtterance(clean.slice(0, 2000));
      if (matchedVoice) {
        utterance.voice = matchedVoice;
        utterance.lang = matchedVoice.lang || langOption.speechLang;
      } else {
        utterance.lang = langOption.speechLang;
      }

      if (gender === 'boy') {
        const matchedRealMale = matchedVoice ? isMaleVoice(matchedVoice) : false;
        const matchedFemaleFallback = matchedVoice ? isFemaleVoice(matchedVoice) : false;
        if (matchedRealMale) {
          utterance.pitch =
            targetVoice === 'Fenrir'
              ? 0.88
              : targetVoice === 'Orus'
                ? 0.92
                : targetVoice === 'Charon'
                  ? 0.95
                  : 1.0;
        } else if (matchedFemaleFallback) {
          utterance.pitch = targetVoice === 'Fenrir' ? 0.65 : 0.72;
        } else {
          utterance.pitch = targetVoice === 'Fenrir' ? 0.76 : 0.82;
        }
      } else {
        utterance.pitch =
          matchedVoice && isFemaleVoice(matchedVoice) ? 1.04 : 1.12;
      }

      utterance.rate = 1.0;
      utterance.onend = () => setSpeakingId(null);
      utterance.onerror = () => setSpeakingId(null);
      setSpeakingId(messageId);

      window.speechSynthesis.cancel();
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 30);
    },
    [loadBrowserVoices, onError, preferredLanguage]
  );

  const speakText = useCallback(
    async (messageId: string, text: string, overrideVoice?: VoiceName) => {
      if (!text.trim()) return;
      if (speakingId === messageId) {
        stopSpeaking();
        return;
      }

      stopSpeaking();
      const targetVoice = overrideVoice || voiceName;
      const cacheKey = `${targetVoice}::${preferredLanguage}::${text.slice(0, 2800)}`;

      const playWavBase64 = async (base64: string, mime = 'audio/wav') => {
        const audio = new Audio(`data:${mime};base64,${base64}`);
        audioElementRef.current = audio;
        audio.onended = () => {
          setSpeakingId(null);
          audioElementRef.current = null;
        };
        audio.onerror = () => {
          setSpeakingId(null);
          audioElementRef.current = null;
        };
        setSpeakingId(messageId);
        await audio.play();
      };

      const cached = ttsCacheRef.current.get(cacheKey);
      if (cached) {
        try {
          await playWavBase64(cached);
          return;
        } catch {
          // Fall through to fresh fetch or browser fallback
        }
      }

      setLoadingSpeechId(messageId);

      try {
        const response = await fetch('/api/audio/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voiceName: targetVoice,
            preferredLanguage,
          }),
        });

        const data = await response.json();
        if (!response.ok || data.fallback || !data.audioBase64) {
          setLoadingSpeechId(null);
          await speakWithBrowserFallback(messageId, text, targetVoice);
          return;
        }

        if (ttsCacheRef.current.size >= 40) {
          const oldest = ttsCacheRef.current.keys().next().value;
          if (oldest) ttsCacheRef.current.delete(oldest);
        }
        ttsCacheRef.current.set(cacheKey, data.audioBase64);

        setLoadingSpeechId(null);
        await playWavBase64(data.audioBase64, data.mimeType || 'audio/wav');
      } catch {
        setLoadingSpeechId(null);
        await speakWithBrowserFallback(messageId, text, targetVoice);
      }
    },
    [preferredLanguage, speakWithBrowserFallback, speakingId, stopSpeaking, voiceName]
  );

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      const handleVoicesChanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener?.('voiceschanged', handleVoicesChanged);
      return () => {
        window.speechSynthesis.removeEventListener?.('voiceschanged', handleVoicesChanged);
        stopListening();
        stopSpeaking();
        stopMediaStream();
      };
    }
    return () => {
      stopListening();
      stopSpeaking();
      stopMediaStream();
    };
  }, [stopListening, stopMediaStream, stopSpeaking]);

  return {
    isListening,
    isTranscribing,
    interimText,
    speakingId,
    loadingSpeechId,
    startListening,
    stopListening,
    speakText,
    stopSpeaking,
  };
}
