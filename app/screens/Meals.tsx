import React, { useCallback } from 'react';
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
import { DaySummary } from '../types/index';

// ─── Sub-components ──────────────────────────────────────────

interface DayCardProps {
  day: DaySummary;
  onPress: (day: DaySummary) => void;
}

function DayCard({ day, onPress }: DayCardProps) {
  const isToday = day.date === new Date().toISOString().split('T')[0];

  return (
    <TouchableOpacity
      style={[styles.dayCard, isToday && styles.dayCardToday]}
      onPress={() => onPress(day)}
      activeOpacity={0.75}
    >
      <View style={styles.dayLeft}>
        <View style={[styles.dayNumberCircle, isToday && styles.dayNumberCircleToday]}>
          <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>
            {day.day_of_plan}
          </Text>
        </View>
        {isToday && <Text style={styles.todayLabel}>HOY</Text>}
      </View>
      <View style={styles.dayBody}>
        <Text style={styles.dayDate}>{day.date}</Text>
        <Text style={styles.mealsSummary} numberOfLines={2}>
          {day.meals_summary}
        </Text>
        <View style={styles.dayMeta}>
          <Text style={styles.cookingTime}>⏱ {day.cooking_estimated}</Text>
        </View>
      </View>
      {day.tap_for_details && (
        <Text style={styles.chevron}>›</Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────

export default function Meals() {
  const { screenData } = useStore();

  const mealsData = screenData?.screens.meals ?? null;
  const allDays = mealsData?.all_21_days ?? [];

  const handleDayPress = useCallback((day: DaySummary) => {
    console.log('[Meals] Tapped day:', day.date, 'day_of_plan:', day.day_of_plan);
  }, []);

  type ListItem =
    | { kind: 'header' }
    | { kind: 'day'; day: DaySummary }
    | { kind: 'empty' };

  const listData: ListItem[] = (() => {
    if (allDays.length === 0) return [{ kind: 'empty' }];
    const items: ListItem[] = [{ kind: 'header' }];
    allDays.forEach((d) => items.push({ kind: 'day', day: d }));
    return items;
  })();

  function renderItem({ item }: ListRenderItemInfo<ListItem>) {
    if (item.kind === 'header') {
      return (
        <View style={styles.listHeader}>
          <Text style={styles.listHeaderText}>
            Plan de 21 días · {allDays.length} días cargados
          </Text>
        </View>
      );
    }

    if (item.kind === 'day') {
      return <DayCard day={item.day} onPress={handleDayPress} />;
    }

    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>📅</Text>
        <Text style={styles.emptyTitle}>Sin plan cargado</Text>
        <Text style={styles.emptyBody}>
          Sube tu PDF de dieta para ver el plan de 21 días aquí.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Plan de comidas</Text>
        {allDays.length > 0 && (
          <Text style={styles.screenCount}>{allDays.length} días</Text>
        )}
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item, index) => {
          if (item.kind === 'day') return `day-${item.day.date}-${item.day.day_of_plan}`;
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
  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  listHeaderText: {
    fontSize: 13,
    color: '#757575',
    fontWeight: '500',
  },
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
  dayCardToday: {
    borderWidth: 2,
    borderColor: '#2D6A4F',
    backgroundColor: '#F1F8F5',
  },
  dayLeft: {
    alignItems: 'center',
    marginRight: 14,
    width: 40,
  },
  dayNumberCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEEEEE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayNumberCircleToday: {
    backgroundColor: '#2D6A4F',
  },
  dayNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#424242',
  },
  dayNumberToday: {
    color: '#FFFFFF',
  },
  todayLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#2D6A4F',
    letterSpacing: 0.5,
    marginTop: 3,
  },
  dayBody: {
    flex: 1,
  },
  dayDate: {
    fontSize: 13,
    color: '#757575',
    marginBottom: 3,
  },
  mealsSummary: {
    fontSize: 14,
    color: '#1B1B1B',
    fontWeight: '500',
    lineHeight: 20,
  },
  dayMeta: {
    flexDirection: 'row',
    marginTop: 6,
  },
  cookingTime: {
    fontSize: 12,
    color: '#616161',
  },
  chevron: {
    fontSize: 22,
    color: '#BDBDBD',
    marginLeft: 8,
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
