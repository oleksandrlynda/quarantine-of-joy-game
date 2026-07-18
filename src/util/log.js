let diagnosticErrorSink = null;

export function setDiagnosticErrorSink(sink) {
  diagnosticErrorSink = typeof sink === 'function' ? sink : null;
}

export function logError(error, context = null){
  console.error(error);
  if (diagnosticErrorSink) {
    try { diagnosticErrorSink(error, context); } catch {}
  }
}
