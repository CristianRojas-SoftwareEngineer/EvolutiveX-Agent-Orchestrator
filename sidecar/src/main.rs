/// tts-sidecar: Sidecar de síntesis de voz TTS
///
/// Protocolo STDIN/JSON:
///   Entrada: `{"cmd":"speak","text":"...","voice":"..."}\n`
///   Salida OK: `{"status":"ok"}\n`
///   Salida error: `{"status":"error","reason":"..."}\n`
///
/// Args CLI:
///   --model <path.onnx>  Ruta al modelo ONNX de la voz
///
/// espeak-ng se carga desde el directorio del binario (no del sistema).
use std::io::{self, BufRead, Write};
use std::path::PathBuf;

use clap::Parser;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use sherpa_onnx::{OfflineTts, OfflineTtsConfig, OfflineTtsModelConfig, OfflineTtsVitsModelConfig, GenerationConfig};

#[derive(Parser, Debug)]
#[command(name = "tts-sidecar", about = "Sidecar TTS para síntesis de voz con sherpa-onnx")]
struct Cli {
    /// Ruta al modelo ONNX de la voz
    #[arg(long)]
    model: PathBuf,
    /// Directorio con espeak-ng-data (contiene lang/, voices/, dicts/)
    #[arg(long)]
    data_dir: Option<PathBuf>,
}

#[derive(Deserialize)]
struct SpeakCmd {
    cmd: String,
    text: String,
    #[serde(default)]
    #[allow(dead_code)]
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

    // Usar la configuración por defecto del dispositivo para evitar incompatibilidades
    let supported = device.default_output_config()
        .map_err(|e| format!("default_output_config: {}", e))?;

    // Si el sample rate del modelo no coincide, resamplear
    let target_rate = supported.sample_rate().0;
    let target_channels = supported.channels();
    let samples: Vec<f32> = if sample_rate != target_rate || target_channels != 1 {
        eprintln!("[tts-sidecar] resampleando {}Hz mono → {}Hz {}ch", sample_rate, target_rate, target_channels);
        resample_interp(samples, sample_rate, target_rate, target_channels)?
    } else {
        samples.to_vec()
    };

    let config = supported.config();
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

    while !done.load(std::sync::atomic::Ordering::Acquire) {
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    std::thread::sleep(std::time::Duration::from_millis(100));
    Ok(())
}

/// Resamplea audio f32 de un sample rate a otro, convirtiendo mono a stereo si es necesario.
fn resample_interp(samples: &[f32], from_rate: u32, to_rate: u32, channels: u16) -> Result<Vec<f32>, String> {
    if samples.is_empty() {
        return Ok(Vec::new());
    }
    let ratio = to_rate as f64 / from_rate as f64;
    let to_len = ((samples.len() as f64) * ratio) as usize;
    let mut out = Vec::with_capacity(to_len * channels as usize);

    for i in 0..to_len {
        let src_pos = i as f64 / ratio;
        let src_idx = src_pos as usize;
        let frac = (src_pos - src_idx as f64) as f32;

        let s0 = samples.get(src_idx).copied().unwrap_or(0.0);
        let s1 = samples.get(src_idx + 1).copied().unwrap_or(s0);

        // Interpolación lineal
        let sample = s0 * (1.0 - frac) + s1 * frac;

        // Duplicar para stereo si es necesario
        for _ in 0..channels {
            out.push(sample);
        }
    }
    Ok(out)
}

fn main() {
    let cli = Cli::parse();

    // Derivar el path del archivo de tokens desde el path del modelo.
    let tokens_path = cli.model.with_extension("onnx.tokens").to_string_lossy().into_owned();

    // Construir la configuración del sintetizador TTS con la estructura vits.
    let mut vits_config = OfflineTtsVitsModelConfig {
        model: Some(cli.model.to_string_lossy().into_owned()),
        tokens: Some(tokens_path),
        noise_scale: 0.667,
        noise_scale_w: 0.8,
        length_scale: 1.0,
        ..Default::default()
    };

    // Si se provee --data-dir, usarlo para que espeak-ng convierta texto a fonemas.
    if let Some(ref data_dir) = cli.data_dir {
        vits_config.data_dir = Some(data_dir.to_string_lossy().into_owned());
    }

    let config = OfflineTtsConfig {
        model: OfflineTtsModelConfig {
            vits: vits_config,
            ..Default::default()
        },
        ..Default::default()
    };

    // Inicializar el sintetizador. Si falla, no podemos continuar.
    let tts = match OfflineTts::create(&config) {
        Some(t) => t,
        None => {
            let resp = SpeakResponse::error("init TTS: create returned None");
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
        // generate_with_config requiere (text, &GenerationConfig, callback).
        // speed=1.0 se mapea a GenerationConfig::default() con speed=1.0.
        let config = GenerationConfig {
            speed: 0.85,
            ..Default::default()
        };
        let output = match tts.generate_with_config::<Box<dyn FnMut(&[f32], f32) -> bool + 'static>>(&cmd.text, &config, None) {
            Some(o) => o,
            None => {
                let resp = SpeakResponse::error("generación TTS: generate_with_config devolvió None");
                reply(&resp);
                continue;
            }
        };
        let sample_rate = output.sample_rate();
        let samples = output.samples();

        // Reproducir por CPAL.
        match play_audio(samples, sample_rate as u32) {
            Ok(()) => reply(&SpeakResponse::ok()),
            Err(e) => {
                let resp = SpeakResponse::error(format!("reproducción de audio: {}", e));
                reply(&resp);
            }
        }
    }
}
