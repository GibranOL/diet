import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ListRenderItemInfo,
} from 'react-native';
import { useStore } from '../store/useStore';
import { MobileShoppingCategory, MobileShoppingItem } from '../types/index';

// ─── Types ────────────────────────────────────────────────────

type CheckedState = Record<string, boolean>;

// ─── Sub-components ──────────────────────────────────────────

interface ShoppingItemRowProps {
  item: MobileShoppingItem;
  itemKey: string;
  checked: boolean;
  onToggle: (key: string) => void;
}

function ShoppingItemRow({ item, itemKey, checked, onToggle }: ShoppingItemRowProps) {
  const badgeColors: Record<string, { bg: string; text: string }> = {
    EXPIRING_SOON: { bg: '#FFF3E0', text: '#E65100' },
    EARLY_BUY_WARNING: { bg: '#E8F5E9', text: '#2E7D32' },
    WASTE_RISK: { bg: '#FCE4EC', text: '#880E4F' },
  };
  const badge = item.badge ? badgeColors[item.badge] : null;

  return (
    <TouchableOpacity
      style={[styles.itemRow, checked && styles.itemRowChecked]}
      onPress={() => onToggle(itemKey)}
      activeOpacity={0.7}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <View style={styles.itemInfo}>
        <Text style={[styles.itemName, checked && styles.itemNameChecked]}>
          {item.name}
        </Text>
        <Text style={styles.itemQuantity}>{item.quantity}</Text>
      </View>
      <View style={styles.itemRight}>
        {item.cost ? (
          <Text style={styles.itemCost}>{item.cost}</Text>
        ) : null}
        {item.badge && badge ? (
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.text }]}>
              {item.badge.replace(/_/g, ' ')}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

interface CategorySectionProps {
  category: MobileShoppingCategory;
  checked: CheckedState;
  onToggle: (key: string) => void;
}

function CategorySection({ category, checked, onToggle }: CategorySectionProps) {
  const checkedCount = category.items.filter(
    (_, i) => checked[`${category.category}-${i}`]
  ).length;

  return (
    <View style={styles.categorySection}>
      <View style={styles.categoryHeader}>
        <Text style={styles.categoryTitle}>{category.category}</Text>
        <Text style={styles.categoryProgress}>
          {checkedCount}/{category.items.length}
          {category.subtotal != null ? `  ·  $${category.subtotal.toFixed(2)}` : ''}
        </Text>
      </View>
      {category.items.map((item, i) => {
        const key = `${category.category}-${i}`;
        return (
          <ShoppingItemRow
            key={key}
            item={item}
            itemKey={key}
            checked={!!checked[key]}
            onToggle={onToggle}
          />
        );
      })}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────

export default function Shopping() {
  const { screenData } = useStore();
  const [checked, setChecked] = useState<CheckedState>({});

  const session = screenData?.screens.shopping.upcoming_session ?? null;
  const categories = session?.by_category ?? [];

  const handleToggle = useCallback((key: string) => {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const totalChecked = Object.values(checked).filter(Boolean).length;
  const totalItems = session?.items_count ?? 0;

  // FlatList data: one entry per category + header and footer items
  type ListItem =
    | { kind: 'header' }
    | { kind: 'category'; category: MobileShoppingCategory }
    | { kind: 'warning'; text: string }
    | { kind: 'empty' };

  const listData: ListItem[] = (() => {
    if (!session) return [{ kind: 'empty' }];
    const items: ListItem[] = [{ kind: 'header' }];
    categories.forEach((c) => items.push({ kind: 'category', category: c }));
    (session.warnings ?? []).forEach((w) => items.push({ kind: 'warning', text: w }));
    return items;
  })();

  function renderItem({ item }: ListRenderItemInfo<ListItem>) {
    if (item.kind === 'header') {
      return (
        <View style={styles.sessionHeader}>
          <View>
            <Text style={styles.sessionDate}>📅 {session!.date}</Text>
            <Text style={styles.sessionMeta}>
              {session!.days_covered} días cubiertos · {totalItems} productos
            </Text>
            {session!.total_cost_estimated != null && (
              <Text style={styles.sessionCost}>
                Total estimado: ${session!.total_cost_estimated.toFixed(2)}
              </Text>
            )}
          </View>
          <View style={styles.progressPill}>
            <Text style={styles.progressText}>
              {totalChecked}/{totalItems}
            </Text>
          </View>
        </View>
      );
    }

    if (item.kind === 'category') {
      return (
        <CategorySection
          category={item.category}
          checked={checked}
          onToggle={handleToggle}
        />
      );
    }

    if (item.kind === 'warning') {
      return (
        <View style={styles.warningRow}>
          <Text style={styles.warningText}>⚠ {item.text}</Text>
        </View>
      );
    }

    // empty
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>🛒</Text>
        <Text style={styles.emptyTitle}>Sin sesión de compras próxima</Text>
        <Text style={styles.emptyBody}>
          Cuando haya una sesión planificada aparecerá aquí con la lista completa.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Lista de compras</Text>
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item, index) => {
          if (item.kind === 'category') return `cat-${item.category.category}`;
          return `${item.kind}-${index}`;
        }}
        renderItem={renderItem}
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
  listContent: {
    paddingBottom: 24,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sessionDate: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1B1B1B',
  },
  sessionMeta: {
    fontSize: 13,
    color: '#757575',
    marginTop: 3,
  },
  sessionCost: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D6A4F',
    marginTop: 5,
  },
  progressPill: {
    backgroundColor: '#2D6A4F',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  progressText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  categorySection: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F9F9F9',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#424242',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryProgress: {
    fontSize: 12,
    color: '#757575',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  itemRowChecked: {
    backgroundColor: '#F9FFF9',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#BDBDBD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#2D6A4F',
    borderColor: '#2D6A4F',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    color: '#1B1B1B',
    fontWeight: '500',
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
    color: '#9E9E9E',
  },
  itemQuantity: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  itemRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  itemCost: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2D6A4F',
  },
  badge: {
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  warningRow: {
    backgroundColor: '#FFF8E1',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#FFC107',
  },
  warningText: {
    fontSize: 13,
    color: '#5D4037',
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
