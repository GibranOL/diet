import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useStore } from '../store/useStore';
import { MealsStackParamList, ParsedMealDay, MobileInventoryItem } from '../types/index';

type MealsNav = StackNavigationProp<MealsStackParamList, 'MealsMain'>;

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// ─── Calendar helpers ──────────────────────────────────────

function getMonthDays(year: number, month: number) {
  // month is 0-indexed
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();

  // Monday = 0, Sunday = 6
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // pad to complete last week
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function toDateStr(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function getMonthLabel(year: number, month: number): string {
  const date = new Date(year, month, 15);
  const label = date.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ─── Dot indicator component ────────────────────────────────

function DotRow({ colors }: { colors: string[] }) {
  if (colors.length === 0) return null;
  return (
    <View style={styles.dotRow}>
      {colors.map((c, i) => (
        <View key={i} style={[styles.dot, { backgroundColor: c }]} />
      ))}
    </View>
  );
}

// ─── Calendar component ─────────────────────────────────────

interface CalendarProps {
  year: number;
  month: number;
  mealDates: Set<string>;
  expiryDates: Map<string, string>; // date → worst status color
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onChangeMonth: (delta: number) => void;
}

function Calendar({
  year,
  month,
  mealDates,
  expiryDates,
  selectedDate,
  onSelectDate,
  onChangeMonth,
}: CalendarProps) {
  const cells = getMonthDays(year, month);
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <View style={styles.calendarContainer}>
      {/* Month header */}
      <View style={styles.monthHeader}>
        <TouchableOpacity onPress={() => onChangeMonth(-1)} style={styles.monthArrow}>
          <Text style={styles.monthArrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{getMonthLabel(year, month)}</Text>
        <TouchableOpacity onPress={() => onChangeMonth(1)} style={styles.monthArrow}>
          <Text style={styles.monthArrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day names */}
      <View style={styles.weekRow}>
        {DAY_NAMES.map((d) => (
          <View key={d} style={styles.weekCell}>
            <Text style={styles.weekLabel}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Day cells */}
      {Array.from({ length: cells.length / 7 }, (_, weekIdx) => (
        <View key={weekIdx} style={styles.weekRow}>
          {cells.slice(weekIdx * 7, weekIdx * 7 + 7).map((day, cellIdx) => {
            if (day == null) {
              return <View key={cellIdx} style={styles.dayCell} />;
            }

            const dateStr = toDateStr(year, month, day);
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const hasMeal = mealDates.has(dateStr);
            const expiryColor = expiryDates.get(dateStr);

            const dots: string[] = [];
            if (hasMeal) dots.push('#2D6A4F'); // green
            if (expiryColor) dots.push(expiryColor);

            return (
              <TouchableOpacity
                key={cellIdx}
                style={[
                  styles.dayCell,
                  isToday && styles.dayCellToday,
                  isSelected && styles.dayCellSelected,
                ]}
                onPress={() => onSelectDate(dateStr)}
                activeOpacity={0.6}
              >
                <Text
                  style={[
                    styles.dayText,
                    isToday && styles.dayTextToday,
                    isSelected && styles.dayTextSelected,
                    hasMeal && !isToday && !isSelected && styles.dayTextMeal,
                  ]}
                >
                  {day}
                </Text>
                <DotRow colors={dots} />
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#2D6A4F' }]} />
          <Text style={styles.legendLabel}>Día de cocina</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#F57C00' }]} />
          <Text style={styles.legendLabel}>Producto expira</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#D32F2F' }]} />
          <Text style={styles.legendLabel}>Producto vencido</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Day detail card (below calendar) ──────────────────────

function DayDetailCard({
  mealDay,
  onPress,
}: {
  mealDay: ParsedMealDay;
  onPress: () => void;
}) {
  const dishNames = mealDay.meals.flatMap((m) =>
    m.dishes.map((d) => d.name)
  );

  return (
    <TouchableOpacity style={styles.detailCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.detailHeader}>
        <Text style={styles.detailDate}>{mealDay.raw_date_str || mealDay.date}</Text>
        <Text style={styles.detailChevron}>Ver detalle ›</Text>
      </View>
      {mealDay.meals.map((meal, idx) => {
        const dishes = meal.dishes.map((d) => d.name).join(', ');
        const emoji: Record<string, string> = {
          'Al despertar': '🌅',
          Desayuno: '🥞',
          'Medio día': '🍎',
          Comida: '🍽',
          'Media tarde': '☕',
          Cena: '🌙',
        };
        return (
          <View key={idx} style={styles.mealRow}>
            <Text style={styles.mealEmoji}>{emoji[meal.mealType] ?? '🍴'}</Text>
            <View style={styles.mealInfo}>
              <Text style={styles.mealType}>{meal.mealType}</Text>
              <Text style={styles.mealDishes} numberOfLines={2}>
                {dishes || 'Sin platillos'}
              </Text>
            </View>
          </View>
        );
      })}
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────

export default function Meals() {
  const navigation = useNavigation<MealsNav>();
  const { screenData, mealDays, fetchMealDays } = useStore();

  // Fetch full meal data on mount
  useEffect(() => {
    if (mealDays.length === 0) {
      fetchMealDays();
    }
  }, []);

  // Calendar state: start on the month of the first meal day or today
  const initialDate = useMemo(() => {
    if (mealDays.length > 0) {
      const d = new Date(mealDays[0].date + 'T12:00:00Z');
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [mealDays]);

  const [calYear, setCalYear] = useState(initialDate.year);
  const [calMonth, setCalMonth] = useState(initialDate.month);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Update calendar when initial date changes
  useEffect(() => {
    setCalYear(initialDate.year);
    setCalMonth(initialDate.month);
  }, [initialDate.year, initialDate.month]);

  // Build data sets for the calendar
  const mealDates = useMemo(
    () => new Set(mealDays.map((d) => d.date)),
    [mealDays]
  );

  const expiryDates = useMemo(() => {
    const map = new Map<string, string>();
    const items: MobileInventoryItem[] = screenData?.screens.inventory.items ?? [];
    for (const item of items) {
      if (item.status === 'EXPIRED' || item.status === 'EXPIRING_SOON' || item.status === 'USE_NEXT') {
        // We don't have the exact expiry_date in MobileInventoryItem,
        // but we can use today + days info. Mark today's date for alerts.
        const color =
          item.status === 'EXPIRED'
            ? '#D32F2F'
            : item.status === 'EXPIRING_SOON'
              ? '#F57C00'
              : '#FBC02D';
        const today = new Date().toISOString().split('T')[0];
        const existing = map.get(today);
        // Keep the worst color (red > orange > yellow)
        if (!existing || color === '#D32F2F' || (color === '#F57C00' && existing !== '#D32F2F')) {
          map.set(today, color);
        }
      }
    }
    return map;
  }, [screenData]);

  const selectedMealDay = useMemo(
    () => (selectedDate ? mealDays.find((d) => d.date === selectedDate) : null),
    [selectedDate, mealDays]
  );

  function handleChangeMonth(delta: number) {
    let newMonth = calMonth + delta;
    let newYear = calYear;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    setCalMonth(newMonth);
    setCalYear(newYear);
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    // If there's a meal for this date, also allow navigation
  }

  function handleNavigateDetail(date: string) {
    navigation.navigate('MealDetail', { date });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Plan de comidas</Text>
        {mealDays.length > 0 && (
          <Text style={styles.screenCount}>{mealDays.length} días</Text>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Calendar
          year={calYear}
          month={calMonth}
          mealDates={mealDates}
          expiryDates={expiryDates}
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
          onChangeMonth={handleChangeMonth}
        />

        {/* Selected day detail */}
        {selectedMealDay ? (
          <DayDetailCard
            mealDay={selectedMealDay}
            onPress={() => handleNavigateDetail(selectedMealDay.date)}
          />
        ) : selectedDate && !selectedMealDay ? (
          <View style={styles.noMealCard}>
            <Text style={styles.noMealText}>
              No hay plan de comida para este día.
            </Text>
          </View>
        ) : null}

        {/* All meal days as compact list */}
        {mealDays.length > 0 && (
          <View style={styles.allDaysSection}>
            <Text style={styles.sectionHeader}>Todos los días</Text>
            {mealDays.map((day, idx) => {
              const dishes = day.meals
                .flatMap((m) => m.dishes.map((d) => d.name))
                .slice(0, 3)
                .join(', ');
              return (
                <TouchableOpacity
                  key={day.date}
                  style={styles.compactCard}
                  onPress={() => handleNavigateDetail(day.date)}
                  activeOpacity={0.7}
                >
                  <View style={styles.compactLeft}>
                    <View style={styles.compactCircle}>
                      <Text style={styles.compactNum}>{idx + 1}</Text>
                    </View>
                  </View>
                  <View style={styles.compactBody}>
                    <Text style={styles.compactDate}>{day.raw_date_str || day.date}</Text>
                    <Text style={styles.compactDishes} numberOfLines={1}>
                      {dishes || 'Sin platillos'}
                    </Text>
                  </View>
                  <Text style={styles.compactChevron}>›</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {mealDays.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={styles.emptyTitle}>Sin plan cargado</Text>
            <Text style={styles.emptyBody}>
              Sube tu PDF de dieta para ver el plan en el calendario.
            </Text>
          </View>
        )}
      </ScrollView>
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
  scrollContent: {
    paddingBottom: 32,
  },

  // Calendar
  calendarContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthArrow: {
    padding: 8,
  },
  monthArrowText: {
    fontSize: 24,
    color: '#2D6A4F',
    fontWeight: '600',
  },
  monthLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1B1B1B',
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  weekLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9E9E9E',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    minHeight: 44,
  },
  dayCellToday: {
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
  },
  dayCellSelected: {
    backgroundColor: '#2D6A4F',
    borderRadius: 10,
  },
  dayText: {
    fontSize: 14,
    color: '#424242',
  },
  dayTextToday: {
    fontWeight: '700',
    color: '#2D6A4F',
  },
  dayTextSelected: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dayTextMeal: {
    fontWeight: '700',
    color: '#1B1B1B',
  },
  dotRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 11,
    color: '#757575',
  },

  // Detail card
  detailCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailDate: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1B1B1B',
  },
  detailChevron: {
    fontSize: 14,
    color: '#2D6A4F',
    fontWeight: '600',
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  mealEmoji: {
    fontSize: 18,
    marginRight: 10,
    marginTop: 1,
  },
  mealInfo: {
    flex: 1,
  },
  mealType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D6A4F',
  },
  mealDishes: {
    fontSize: 13,
    color: '#616161',
    marginTop: 2,
    lineHeight: 18,
  },
  noMealCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  noMealText: {
    fontSize: 14,
    color: '#9E9E9E',
  },

  // All days section
  allDaysSection: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1B1B1B',
    marginBottom: 10,
  },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  compactLeft: {
    marginRight: 12,
  },
  compactCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactNum: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2D6A4F',
  },
  compactBody: {
    flex: 1,
  },
  compactDate: {
    fontSize: 13,
    color: '#757575',
  },
  compactDishes: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1B1B1B',
    marginTop: 2,
  },
  compactChevron: {
    fontSize: 20,
    color: '#BDBDBD',
    marginLeft: 8,
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 40,
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
