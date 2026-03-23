import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useStore } from '../store/useStore';

// ─── Types ────────────────────────────────────────────────────

interface SelectedFile {
  uri: string;
  name: string;
  size: number | undefined;
}

// ─── Main Screen ─────────────────────────────────────────────

export default function UploadPDF() {
  const { uploadPDFs, isLoading, error, screenData } = useStore();
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [uploadDone, setUploadDone] = useState(false);

  const uploadScreenData = screenData?.screens.upload_pdf ?? null;

  const handlePickFiles = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const files: SelectedFile[] = result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.name,
        size: asset.size,
      }));

      setSelectedFiles(files);
      setUploadDone(false);
    } catch {
      Alert.alert('Error', 'No se pudo abrir el selector de archivos.');
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (selectedFiles.length === 0) return;

    const uris = selectedFiles.map((f) => f.uri);

    try {
      await uploadPDFs(uris);
      setUploadDone(true);
      setSelectedFiles([]);
    } catch {
      // Error is stored in the zustand store; surface it via the error banner
    }
  }, [selectedFiles, uploadPDFs]);

  const handleRemoveFile = useCallback((uri: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.uri !== uri));
  }, []);

  function formatBytes(bytes: number | undefined): string {
    if (bytes == null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const instructions =
    uploadScreenData?.instructions ??
    'Selecciona uno o varios PDF con tu plan de dieta de 21 días. El sistema los procesará para extraer comidas, ingredientes y generar tu lista de compras e inventario.';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Subir PDF</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Instructions card */}
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>📋 Instrucciones</Text>
          <Text style={styles.instructionsText}>{instructions}</Text>
        </View>

        {/* Plan status */}
        {uploadScreenData && (
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Estado actual</Text>
              <StatusBadge status={uploadScreenData.status} />
            </View>
            {uploadScreenData.current_plan_days_remaining > 0 && (
              <Text style={styles.statusMeta}>
                📅 {uploadScreenData.current_plan_days_remaining} días restantes en el plan actual
              </Text>
            )}
            {uploadScreenData.next_upload_recommended ? (
              <Text style={styles.statusMeta}>
                🔔 Próxima subida recomendada: {uploadScreenData.next_upload_recommended}
              </Text>
            ) : null}
          </View>
        )}

        {/* Error banner */}
        {error && !isLoading && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠ {error}</Text>
          </View>
        )}

        {/* Success banner */}
        {uploadDone && !error && (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>
              ✅ PDFs subidos correctamente. El plan se está procesando.
            </Text>
          </View>
        )}

        {/* Pick files button */}
        <TouchableOpacity
          style={[styles.pickButton, isLoading && styles.buttonDisabled]}
          onPress={handlePickFiles}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          <Text style={styles.pickButtonText}>📂 Seleccionar PDFs</Text>
        </TouchableOpacity>

        {/* Selected files list */}
        {selectedFiles.length > 0 && (
          <View style={styles.filesSection}>
            <Text style={styles.filesSectionTitle}>
              Archivos seleccionados ({selectedFiles.length})
            </Text>
            {selectedFiles.map((file) => (
              <View key={file.uri} style={styles.fileRow}>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    📄 {file.name}
                  </Text>
                  {file.size != null && (
                    <Text style={styles.fileSize}>{formatBytes(file.size)}</Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => handleRemoveFile(file.uri)}
                  style={styles.removeBtn}
                  disabled={isLoading}
                >
                  <Text style={styles.removeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* Upload button */}
            <TouchableOpacity
              style={[styles.uploadButton, isLoading && styles.buttonDisabled]}
              onPress={handleUpload}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <View style={styles.uploadingRow}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.uploadButtonText}>Subiendo...</Text>
                </View>
              ) : (
                <Text style={styles.uploadButtonText}>
                  📤 Subir {selectedFiles.length} archivo{selectedFiles.length !== 1 ? 's' : ''}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Empty prompt when no files selected */}
        {selectedFiles.length === 0 && !isLoading && !uploadDone && (
          <View style={styles.emptyPrompt}>
            <Text style={styles.emptyPromptEmoji}>📤</Text>
            <Text style={styles.emptyPromptText}>
              Ningún archivo seleccionado aún.{'\n'}Pulsa el botón para elegir tus PDFs.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Status Badge ─────────────────────────────────────────────

interface StatusBadgeProps {
  status: string;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    READY: { bg: '#E8F5E9', text: '#2E7D32', label: 'Listo' },
    UPLOADING: { bg: '#E3F2FD', text: '#1565C0', label: 'Subiendo' },
    PROCESSING: { bg: '#FFF8E1', text: '#F57F17', label: 'Procesando' },
    SUCCESS: { bg: '#E8F5E9', text: '#1B5E20', label: 'Completado' },
    ERROR: { bg: '#FFEBEE', text: '#B71C1C', label: 'Error' },
  };
  const c = config[status] ?? { bg: '#F5F5F5', text: '#616161', label: status };

  return (
    <View style={[styles.statusBadge, { backgroundColor: c.bg }]}>
      <Text style={[styles.statusBadgeText, { color: c.text }]}>{c.label}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  topBar: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1B1B1B',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  instructionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  instructionsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1B1B1B',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: '#424242',
    lineHeight: 21,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    gap: 6,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusMeta: {
    fontSize: 13,
    color: '#616161',
    lineHeight: 18,
  },
  errorBanner: {
    backgroundColor: '#FFEBEE',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#D32F2F',
  },
  errorText: {
    color: '#C62828',
    fontSize: 13,
    lineHeight: 19,
  },
  successBanner: {
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#388E3C',
  },
  successText: {
    color: '#1B5E20',
    fontSize: 13,
    lineHeight: 19,
  },
  pickButton: {
    backgroundColor: '#1565C0',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  pickButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  filesSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    gap: 10,
  },
  filesSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#424242',
    marginBottom: 2,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 10,
  },
  fileInfo: {
    flex: 1,
    marginRight: 8,
  },
  fileName: {
    fontSize: 14,
    color: '#1B1B1B',
    fontWeight: '500',
  },
  fileSize: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEEEEE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtnText: {
    fontSize: 13,
    color: '#616161',
    fontWeight: '700',
  },
  uploadButton: {
    backgroundColor: '#2D6A4F',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emptyPrompt: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyPromptEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  emptyPromptText: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
    lineHeight: 21,
  },
});
