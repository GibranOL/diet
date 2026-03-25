import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { MobileInventoryItem, InventoryStatus } from '../types/index';

// ─── Helpers ─────────────────────────────────────────────────

const STATUS_COLORS: Record<InventoryStatus, { bg: string; border: string; label: string }> = {
  OK: { bg: '#E8F5E9', border: '#388E3C', label: 'OK' },
  USE_NEXT: { bg: '#FFF8E1', border: '#FBC02D', label: 'Usar pronto' },
  EXPIRING_SOON: { bg: '#FFF3E0', border: '#F57C00', label: 'Vence pronto' },
  EXPIRED: { bg: '#FFEBEE', border: '#D32F2F', label: 'Vencido' },
};

// ─── Sub-components ──────────────────────────────────────────

interface InventoryCardProps {
  item: MobileInventoryItem;
}

function InventoryCard({ item }: InventoryCardProps) {
  const style = STATUS_COLORS[item.status] ?? STATUS_COLORS.OK;

  return (
    <View style={[styles.card, { borderLeftColor: style.border }]}>
      <View style={styles.cardLeft}>
        <Text style={styles.emoji}>{item.emoji}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: style.bg }]}>
            <Text style={[styles.statusText, { color: style.border }]}>
              {style.label}
            </Text>
          </View>
        </View>
        <Text style={styles.quantity}>{item.quantity}</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.expiry}>📅 {item.expiry}</Text>
          {item.used_in_next_meals > 0 && (
            <Text style={styles.mealsUsage}>
              🍽 Usado en {item.used_in_next_meals} comidas
            </Text>
          )}
        </View>
        {item.action ? (
          <Text style={styles.actionText}>→ {item.action}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────

export default function Inventory() {
  const { screenData } = useStore();

  const inventoryData = screenData?.screens.inventory ?? null;
  const items = inventoryData?.items ?? [];
  const summaryText = inventoryData?.summary_text ?? null;
  const alertsCount = inventoryData?.alerts_count ?? 0;

  type ListItem =
    | { kind: 'summary' }
    | { kind: 'item'; item: MobileInventoryItem }
    | { kind: 'empty' };

  const listData: ListItem[] = (() => {
    if (!inventoryData || items.length === 0) return [{ kind: 'empty' }];
    const entries: ListItem[] = [{ kind: 'summary' }];
    items.forEach((i) => entries.push({ kind: 'item', item: i }));
    return entries;
  })();

  function renderItem({ item }: ListRenderItemInfo<ListItem>) {
    if (item.kind === 'summary') {
      return (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryText}>{summaryText}</Text>
          {alertsCount > 0 && (
            <View style={styles.alertsBadge}>
              <Text style={styles.alertsBadgeText}>
                ⚠ {alertsCount} alerta{alertsCount !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>
      );
    }

    if (item.kind === 'item') {
      return <InventoryCard item={item.item} />;
    }

    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>📦</Text>
        <Text style={styles.emptyTitle}>Inventario vacío</Text>
        <Text style={styles.emptyBody}>
          El inventario se calculará automáticamente a partir de tu plan de dieta y las compras registradas.
        </Text>
      </View>
    );
  }

  // Legend header component
  function ListHeader() {
    if (!inventoryData || items.length === 0) return null;
    return (
      <View style={styles.legend}>
        {(Object.keys(STATUS_COLORS) as InventoryStatus[]).map((status) => {
          const s = STATUS_COLORS[status];
          return (
            <View key={status} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: s.border }]} />
              <Text style={styles.legendLabel}>{s.label}</Text>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Inventario</Text>
        {items.length > 0 && (
          <Text style={styles.screenCount}>{items.length} productos</Text>
        )}
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item, index) => {
          if (item.kind === 'item') return `inv-${item.item.name}`;
          return `${item.kind}-${index}`;
        }}
        renderItem={renderItem}
        ListHeaderComponent={<ListHeader />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
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
  screenCount: {
    fontSize: 14,
    color: '#757575',
  },
  listContent: {
    paddingBottom: 24,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
    color: '#616161',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 12,
    marginTop: 4,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryText: {
    flex: 1,
    fontSize: 14,
    color: '#424242',
    lineHeight: 20,
  },
  alertsBadge: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 10,
  },
  alertsBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E65100',
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginVertical: 5,
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardLeft: {
    justifyContent: 'flex-start',
    marginRight: 10,
    paddingTop: 2,
  },
  emoji: {
    fontSize: 24,
  },
  cardBody: {
    flex: 1,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1B1B1B',
    marginRight: 8,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  quantity: {
    fontSize: 13,
    color: '#757575',
    marginTop: 3,
  },
  cardMeta: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 5,
  },
  expiry: {
    fontSize: 12,
    color: '#616161',
  },
  mealsUsage: {
    fontSize: 12,
    color: '#2D6A4F',
    fontWeight: '500',
  },
  actionText: {
    marginTop: 5,
    fontSize: 12,
    color: '#1565C0',
    fontStyle: 'italic',
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
