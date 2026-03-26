import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  StyleSheet,
  ListRenderItemInfo,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { MobileInventoryItem, InventoryStatus, Purchase } from '../types/index';

// ─── Helpers ─────────────────────────────────────────────────

const STATUS_COLORS: Record<InventoryStatus, { bg: string; border: string; label: string }> = {
  OK: { bg: '#E8F5E9', border: '#388E3C', label: 'OK' },
  USE_NEXT: { bg: '#FFF8E1', border: '#FBC02D', label: 'Usar pronto' },
  EXPIRING_SOON: { bg: '#FFF3E0', border: '#F57C00', label: 'Vence pronto' },
  EXPIRED: { bg: '#FFEBEE', border: '#D32F2F', label: 'Vencido' },
};

const UNIT_OPTIONS = ['g', 'ml', 'unidad', 'pieza', 'taza', 'kg', 'lt'];

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

// ─── Add Purchase Modal ─────────────────────────────────────

interface AddPurchaseModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (purchase: Purchase) => void;
  isLoading: boolean;
}

function AddPurchaseModal({ visible, onClose, onSubmit, isLoading }: AddPurchaseModalProps) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('unidad');
  const [shelfDays, setShelfDays] = useState('7');

  function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Error', 'Ingresa el nombre del producto.');
      return;
    }
    const qtyNum = parseFloat(qty);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida.');
      return;
    }
    const shelfNum = parseInt(shelfDays, 10);
    if (isNaN(shelfNum) || shelfNum <= 0) {
      Alert.alert('Error', 'Ingresa días de vida útil válidos.');
      return;
    }

    const purchase: Purchase = {
      ingredient_id: trimmedName.toLowerCase().replace(/\s+/g, '_'),
      canonical_name: trimmedName,
      quantity_purchased: qtyNum,
      unit,
      purchase_date: new Date().toISOString().split('T')[0],
      shelf_life_days: shelfNum,
    };

    onSubmit(purchase);
    // Reset form
    setName('');
    setQty('');
    setUnit('unidad');
    setShelfDays('7');
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Agregar compra</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Product name */}
            <Text style={styles.inputLabel}>Producto</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Ej: Pechuga de pollo"
              value={name}
              onChangeText={setName}
              autoCapitalize="sentences"
            />

            {/* Quantity */}
            <Text style={styles.inputLabel}>Cantidad</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Ej: 500"
              value={qty}
              onChangeText={setQty}
              keyboardType="numeric"
            />

            {/* Unit selector */}
            <Text style={styles.inputLabel}>Unidad</Text>
            <View style={styles.unitRow}>
              {UNIT_OPTIONS.map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[styles.unitChip, unit === u && styles.unitChipActive]}
                  onPress={() => setUnit(u)}
                >
                  <Text style={[styles.unitChipText, unit === u && styles.unitChipTextActive]}>
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Shelf life */}
            <Text style={styles.inputLabel}>Vida útil (días)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="7"
              value={shelfDays}
              onChangeText={setShelfDays}
              keyboardType="numeric"
            />

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              <Text style={styles.submitBtnText}>
                {isLoading ? 'Guardando...' : 'Agregar al inventario'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────

export default function Inventory() {
  const { screenData, isLoading, purchaseItem } = useStore();
  const [showModal, setShowModal] = useState(false);

  const inventoryData = screenData?.screens.inventory ?? null;
  const items = inventoryData?.items ?? [];
  const summaryText = inventoryData?.summary_text ?? null;
  const alertsCount = inventoryData?.alerts_count ?? 0;

  async function handlePurchase(purchase: Purchase) {
    await purchaseItem(purchase);
    setShowModal(false);
  }

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
          Toca el botón + para agregar productos que compraste.
        </Text>
      </View>
    );
  }

  function ListHeader() {
    if (!inventoryData || items.length === 0) return null;
    return (
      <View style={styles.legendRow}>
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

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowModal(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Add Purchase Modal */}
      <AddPurchaseModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handlePurchase}
        isLoading={isLoading}
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
    paddingBottom: 80,
  },
  legendRow: {
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

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2D6A4F',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  fabText: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '300',
    marginTop: -2,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1B1B1B',
  },
  modalClose: {
    fontSize: 20,
    color: '#9E9E9E',
    padding: 4,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 6,
    marginTop: 12,
  },
  textInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#1B1B1B',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  unitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  unitChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  unitChipActive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#2D6A4F',
  },
  unitChipText: {
    fontSize: 14,
    color: '#616161',
  },
  unitChipTextActive: {
    color: '#2D6A4F',
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: '#2D6A4F',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 20,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
