import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  ListRenderItemInfo,
} from 'react-native';
import { useStore } from '../store/useStore';
import { MobileStep, MobileAlert } from '../types/index';

// ─── Helpers ─────────────────────────────────────────────────

function todayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Sub-components ──────────────────────────────────────────

interface StepCardProps {
  step: MobileStep;
  isHighlighted: boolean;
}

function StepCard({ step, isHighlighted }: StepCardProps) {
  return (
    <View style={[styles.stepCard, isHighlighted && styles.stepCardHighlighted]}>
      <View style={styles.stepHeader}>
        <View style={styles.stepOrderBadge}>
          <Text style={styles.stepOrderText}>{step.order}</Text>
        </View>
        <Text style={styles.stepAction} numberOfLines={2}>
          {step.action}
        </Text>
        {step.parallel && (
          <View style={styles.parallelBadge}>
            <Text style={styles.parallelBadgeText}>⚡ Paralelo</Text>
          </View>
        )}
      </View>
      <View style={styles.stepMeta}>
        <Text style={styles.stepDuration}>⏱ {step.duration}</Text>
        {step.timer_enabled && (
          <Text style={styles.timerIndicator}>🔔 Temporizador</Text>
        )}
      </View>
      {step.details ? (
        <Text style={styles.stepDetails}>{step.details}</Text>
      ) : null}
      {step.parallel_text ? (
        <Text style={styles.parallelText}>{step.parallel_text}</Text>
      ) : null}
    </View>
  );
}

interface AlertRowProps {
  alert: MobileAlert;
}

function AlertRow({ alert }: AlertRowProps) {
  const severityColor: Record<string, string> = {
    high: '#D32F2F',
    medium: '#F57C00',
    low: '#388E3C',
  };
  const borderColor = severityColor[alert.severity] ?? '#9E9E9E';

  return (
    <View style={[styles.alertRow, { borderLeftColor: borderColor }]}>
      <Text style={styles.alertEmoji}>{alert.emoji}</Text>
      <View style={styles.alertContent}>
        <Text style={styles.alertMessage}>{alert.message}</Text>
        <Text style={styles.alertAction}>{alert.action}</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────

export default function Today() {
  const { screenData, fetchScreenData, isLoading, error } = useStore();

  const handleRefresh = useCallback(() => {
    fetchScreenData(todayDateString());
  }, [fetchScreenData]);

  useEffect(() => {
    fetchScreenData(todayDateString());
  }, [fetchScreenData]);

  const todayData = screenData?.screens.today ?? null;
  const steps = todayData?.cooking_section.steps ?? [];
  const alerts = todayData?.inventory_alerts ?? [];
  const currentHighlight = todayData?.cooking_section.current_step_highlight ?? -1;

  // Combine steps and a footer sentinel into one list for the FlatList
  type ListItem =
    | { kind: 'header' }
    | { kind: 'step'; step: MobileStep }
    | { kind: 'alerts' }
    | { kind: 'empty' };

  const listData: ListItem[] = (() => {
    if (!todayData) return [{ kind: 'empty' }];
    const items: ListItem[] = [{ kind: 'header' }];
    steps.forEach((s) => items.push({ kind: 'step', step: s }));
    items.push({ kind: 'alerts' });
    return items;
  })();

  function renderItem({ item }: ListRenderItemInfo<ListItem>) {
    if (item.kind === 'header') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Pasos de cocina</Text>
          <Text style={styles.sectionSubtitle}>
            {todayData
              ? `Día ${todayData.day_number} · ${todayData.cooking_section.estimated_time_minutes} min estimados`
              : ''}
          </Text>
        </View>
      );
    }

    if (item.kind === 'step') {
      return (
        <StepCard
          step={item.step}
          isHighlighted={item.step.step_id === currentHighlight}
        />
      );
    }

    if (item.kind === 'alerts') {
      if (alerts.length === 0) return null;
      return (
        <View style={styles.alertsSection}>
          <Text style={styles.sectionTitle}>Alertas de inventario</Text>
          {alerts.map((a, idx) => (
            <AlertRow key={idx} alert={a} />
          ))}
        </View>
      );
    }

    // empty state
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>🥗</Text>
        <Text style={styles.emptyTitle}>Sin datos para hoy</Text>
        <Text style={styles.emptyBody}>
          Sube tu plan de dieta en PDF para ver los pasos de cocina.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.screenTitle}>Hoy</Text>
          <Text style={styles.screenDate}>{todayDateString()}</Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshBtn, isLoading && styles.refreshBtnDisabled]}
          onPress={handleRefresh}
          disabled={isLoading}
        >
          <Text style={styles.refreshBtnText}>↻ Actualizar</Text>
        </TouchableOpacity>
      </View>

      {/* Error banner */}
      {error && !isLoading && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠ {error}</Text>
        </View>
      )}

      {/* Loading overlay */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2D6A4F" />
          <Text style={styles.loadingText}>Cargando datos...</Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, index) => {
            if (item.kind === 'step') return `step-${item.step.step_id}`;
            return `${item.kind}-${index}`;
          }}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1B1B1B',
  },
  screenDate: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  refreshBtn: {
    backgroundColor: '#2D6A4F',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshBtnDisabled: {
    backgroundColor: '#A5C4B5',
  },
  refreshBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EF9A9A',
  },
  errorText: {
    color: '#C62828',
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: '#616161',
  },
  listContent: {
    paddingBottom: 24,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1B1B1B',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  stepCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginVertical: 5,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  stepCardHighlighted: {
    borderLeftWidth: 4,
    borderLeftColor: '#2D6A4F',
    backgroundColor: '#F1F8F5',
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepOrderBadge: {
    backgroundColor: '#2D6A4F',
    borderRadius: 14,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  stepOrderText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  stepAction: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1B1B1B',
    lineHeight: 20,
  },
  parallelBadge: {
    backgroundColor: '#FFF8E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  parallelBadgeText: {
    fontSize: 11,
    color: '#F57F17',
    fontWeight: '600',
  },
  stepMeta: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 8,
  },
  stepDuration: {
    fontSize: 13,
    color: '#616161',
  },
  timerIndicator: {
    fontSize: 13,
    color: '#1565C0',
  },
  stepDetails: {
    marginTop: 6,
    fontSize: 13,
    color: '#757575',
    lineHeight: 18,
  },
  parallelText: {
    marginTop: 4,
    fontSize: 12,
    color: '#F57F17',
    fontStyle: 'italic',
  },
  alertsSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  alertRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderLeftWidth: 4,
    padding: 12,
    marginTop: 8,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  alertEmoji: {
    fontSize: 22,
    marginRight: 10,
  },
  alertContent: {
    flex: 1,
  },
  alertMessage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1B1B1B',
    lineHeight: 19,
  },
  alertAction: {
    fontSize: 12,
    color: '#757575',
    marginTop: 3,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1B1B1B',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 15,
    color: '#757575',
    textAlign: 'center',
    lineHeight: 22,
  },
});
