/// tts-sidecar: Sidecar de síntesis de voz TTS
///
/// Protocolo STDIN/JSON:
///   Entrada: `{"cmd":"speak","text":"...","voice":"..."}\n`
///   Salida OK: `{"status":"ok"}\n`
///   Salida error: `{"status":"error","reason":"..."}\n`
///
/// Args CLI:
///   --model <path.onnx>         Ruta al modelo ONNX de la voz
///
/// espeak-ng se carga desde el directorio del binario (no del sistema).
use std::io::{self, BufRead, Write};
use std::path::PathBuf;

use clap::Parser;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use sherpa_onnx::{OfflineTts, OfflineTtsModelConfig};

#[derive(Parser, Debug)]
#[command(name = "tts-sidecar", about = "Sidecar TTS para síntesis de voz con sherpa-onnx")]
struct Cli {
    /// Ruta al modelo ONNX de la voz
    #[arg(long)]
    model: PathBuf,
}

#[derive(Deserialize)]
struct SpeakCmd {
    cmd: String,
    text: String,
    #[serde(default)]
    voice: String,
}

#[derive(Serialize)]
struct SpeakResponse {
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

impl SpeakResponse {
    fn ok() -> Self {
        Self { status: "ok".to_string(), reason: None }
    }

    fn error(reason: impl Into<String>) -> Self {
        Self { status: "error".to_string(), reason: Some(reason.into()) }
    }
}

fn reply(resp: &SpeakResponse) {
    let json = serde_json::to_string(resp).unwrap_or_else(|_| r#"{"status":"error","reason":"serialize"}"#.to_string());
    // Escribir en stdout seguido de newline; flush inmediato para que el host TypeScript lo lea.
    println!("{}", json);
    let _ = io::stdout().flush();
}

/// Reproduce un array de muestras PCM f32 por el dispositivo de salida por defecto.
fn play_audio(samples: &[f32], sample_rate: u32) -> Result<(), String> {
    let host = cpal::default_host();
    let device = host.default_output_device().ok_or("no hay dispositivo de audio de salida")?;
    let config = cpal::StreamConfig {
        channels: 1,
        sample_rate: cpal::SampleRate(sample_rate),
        buffer_size: cpal::BufferSize::Default,
    };

    // Copiamos las muestras para moverlas al closure del stream.
    let samples: Vec<f32> = samples.to_vec();
    let mut pos = 0usize;
    let done = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let done_clone = done.clone();

    let stream = device
        .build_output_stream(
            &config,
            move |output: &mut [f32], _: &cpal::OutputCallbackInfo| {
                for frame in output.iter_mut() {
                    if pos < samples.len() {
                        *frame = samples[pos];
                        pos += 1;
                    } else {
                        *frame = 0.0;
                        done_clone.store(true, std::sync::atomic::Ordering::Release);
                    }
                }
            },
            |err| {
                eprintln!("[tts-sidecar] error de stream de audio: {}", err);
            },
            None,
        )
        .map_err(|e| format!("build_output_stream: {}", e))?;

    stream.play().map_err(|e| format!("stream.play: {}", e))?;

    // Esperar a que se reproduzcan todas las muestras.
    while !done.load(std::sync::atomic::Ordering::Acquire) {
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    // Dar tiempo al buffer para vaciarse.
    std::thread::sleep(std::time::Duration::from_millis(100));
    Ok(())
}

fn main() {
    let cli = Cli::parse();

    // Construir la configuración del sintetizador TTS.
    let model_config = OfflineTtsModelConfig {
        model: cli.model.to_string_lossy().into_owned(),
        ..Default::default()
    };

    // Inicializar el sintetizador. Si falla, no podemos continuar.
    let tts = match OfflineTts::create(&model_config) {
        Ok(t) => t,
        Err(e) => {
            let resp = SpeakResponse::error(format!("init TTS: {}", e));
            reply(&resp);
            std::process::exit(1);
        }
    };

    // Loop principal: leer comandos de stdin línea a línea.
    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                let resp = SpeakResponse::error(format!("lectura stdin: {}", e));
                reply(&resp);
                break;
            }
        };

        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Parsear el comando JSON.
        let cmd: SpeakCmd = match serde_json::from_str(line) {
            Ok(c) => c,
            Err(e) => {
                let resp = SpeakResponse::error(format!("JSON inválido: {}", e));
                reply(&resp);
                continue;
            }
        };

        if cmd.cmd != "speak" {
            let resp = SpeakResponse::error(format!("comando desconocido: {}", cmd.cmd));
            reply(&resp);
            continue;
        }

        if cmd.text.trim().is_empty() {
            reply(&SpeakResponse::ok());
            continue;
        }

        // Sintetizar audio.
        let audio = match tts.generate(&cmd.text, 0, 1.0) {
            Ok(a) => a,
            Err(e) => {
                let resp = SpeakResponse::error(format!("síntesis TTS: {}", e));
                reply(&resp);
                continue;
            }
        };

        // Reproducir por CPAL.
        let sample_rate = audio.sample_rate as u32;
        match play_audio(&audio.samples, sample_rate) {
            Ok(()) => reply(&SpeakResponse::ok()),
            Err(e) => {
                let resp = SpeakResponse::error(format!("reproducción de audio: {}", e));
                reply(&resp);
            }
        }
    }
}
