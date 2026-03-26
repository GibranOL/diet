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
import { MealsStackParamList, RotationDay, MealTemplate } from '../types/index';

type MealsNav = StackNavigationProp<MealsStackParamList, 'MealsMain'>;

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Color per template label
const TEMPLATE_COLORS = [
  '#2D6A4F', '#1565C0', '#E65100', '#7B1FA2',
  '#C62828', '#00838F', '#4E342E', '#558B2F',
];

function getTemplateColor(index: number): string {
  return TEMPLATE_COLORS[index % TEMPLATE_COLORS.length];
}

// ─── Calendar helpers ──────────────────────────────────────

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
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

// ─── Calendar component ─────────────────────────────────────

interface CalendarProps {
  year: number;
  month: number;
  rotationMap: Map<string, RotationDay>;
  templateColorMap: Map<string, string>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onChangeMonth: (delta: number) => void;
  restDays: Set<number>;
}

function Calendar({
  year, month, rotationMap, templateColorMap,
  selectedDate, onSelectDate, onChangeMonth, restDays,
}: CalendarProps) {
  const cells = getMonthDays(year, month);
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <View style={styles.calendarContainer}>
      <View style={styles.monthHeader}>
        <TouchableOpacity onPress={() => onChangeMonth(-1)} style={styles.monthArrow}>
          <Text style={styles.monthArrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{getMonthLabel(year, month)}</Text>
        <TouchableOpacity onPress={() => onChangeMonth(1)} style={styles.monthArrow}>
          <Text style={styles.monthArrowText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {DAY_NAMES.map((d) => (
          <View key={d} style={styles.weekCell}>
            <Text style={styles.weekLabel}>{d}</Text>
          </View>
        ))}
      </View>

      {Array.from({ length: cells.length / 7 }, (_, weekIdx) => (
        <View key={weekIdx} style={styles.weekRow}>
          {cells.slice(weekIdx * 7, weekIdx * 7 + 7).map((day, cellIdx) => {
            if (day == null) {
              return <View key={cellIdx} style={styles.dayCell} />;
            }

            const dateStr = toDateStr(year, month, day);
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const rotation = rotationMap.get(dateStr);
            const dow = (new Date(year, month, day).getDay() + 6) % 7;
            const isRest = restDays.has(dow) && !rotation;
            const color = rotation ? templateColorMap.get(rotation.template_id) : undefined;

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
                    isToday && !isSelected && styles.dayTextToday,
                    isSelected && styles.dayTextSelected,
                    isRest && styles.dayTextRest,
                  ]}
                >
                  {day}
                </Text>
                {rotation ? (
                  <View style={[styles.labelBadge, { backgroundColor: color ?? '#2D6A4F' }]}>
                    <Text style={styles.labelBadgeText}>{rotation.template_label}</Text>
                  </View>
                ) : isRest ? (
                  <Text style={styles.restText}>---</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Template card ──────────────────────────────────────────

function TemplateCard({
  template, color, onPress,
}: {
  template: MealTemplate; color: string; onPress: () => void;
}) {
  const dishes = template.meals
    .flatMap((m) => m.dishes.map((d) => d.name))
    .slice(0, 4)
    .join(', ');

  return (
    <TouchableOpacity style={styles.templateCard} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.templateBadge, { backgroundColor: color }]}>
        <Text style={styles.templateBadgeText}>{template.label}</Text>
      </View>
      <View style={styles.templateBody}>
        <Text style={styles.templateName}>Plantilla {template.label}</Text>
        <Text style={styles.templateDishes} numberOfLines={2}>{dishes || 'Sin platillos'}</Text>
        {!template.is_active && (
          <Text style={styles.inactiveLabel}>Inactiva</Text>
        )}
      </View>
      <Text style={styles.templateChevron}>›</Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────

export default function Meals() {
  const navigation = useNavigation<MealsNav>();
  const { screenData, templates, rotationPreview, rotationConfig, fetchMealDays } = useStore();

  useEffect(() => {
    if (templates.length === 0) fetchMealDays();
  }, []);

  // Calendar month state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Build rotation map for calendar
  const rotationMap = useMemo(() => {
    const map = new Map<string, RotationDay>();
    // Use rotation_preview from screen data or store
    const preview = screenData?.screens.meals.rotation_preview ?? rotationPreview;
    for (const day of preview) {
      map.set(day.date, day);
    }
    return map;
  }, [screenData, rotationPreview]);

  // Template color map
  const templateColorMap = useMemo(() => {
    const map = new Map<string, string>();
    templates.forEach((t, i) => {
      map.set(t.id, getTemplateColor(i));
    });
    return map;
  }, [templates]);

  // Rest days set
  const restDays = useMemo(
    () => new Set(rotationConfig?.rest_days ?? [6]),
    [rotationConfig]
  );

  // Selected day's rotation
  const selectedRotation = useMemo(
    () => (selectedDate ? rotationMap.get(selectedDate) : null),
    [selectedDate, rotationMap]
  );

  function handleChangeMonth(delta: number) {
    let newMonth = calMonth + delta;
    let newYear = calYear;
    if (newMonth < 0) { newMonth = 11; newYear -= 1; }
    else if (newMonth > 11) { newMonth = 0; newYear += 1; }
    setCalMonth(newMonth);
    setCalYear(newYear);
  }

  function handleNavigateDetail(templateId: string, date?: string) {
    navigation.navigate('MealDetail', { templateId, date });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Plan de comidas</Text>
        {templates.length > 0 && (
          <Text style={styles.screenCount}>{templates.length} plantillas</Text>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Calendar
          year={calYear}
          month={calMonth}
          rotationMap={rotationMap}
          templateColorMap={templateColorMap}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onChangeMonth={handleChangeMonth}
          restDays={restDays}
        />

        {/* Selected day info */}
        {selectedRotation && (
          <TouchableOpacity
            style={styles.detailCard}
            onPress={() => handleNavigateDetail(selectedRotation.template_id, selectedRotation.date)}
            activeOpacity={0.7}
          >
            <View style={styles.detailHeader}>
              <View style={styles.detailLeft}>
                <View style={[styles.detailBadge, { backgroundColor: templateColorMap.get(selectedRotation.template_id) ?? '#2D6A4F' }]}>
                  <Text style={styles.detailBadgeText}>{selectedRotation.template_label}</Text>
                </View>
                <Text style={styles.detailDate}>{selectedDate}</Text>
              </View>
              <Text style={styles.detailChevron}>Ver detalle ›</Text>
            </View>
            {selectedRotation.meals.slice(0, 3).map((meal, idx) => {
              const dishes = meal.dishes.map((d) => d.name).join(', ');
              return (
                <View key={idx} style={styles.mealRow}>
                  <Text style={styles.mealType}>{meal.mealType}</Text>
                  <Text style={styles.mealDishes} numberOfLines={1}>{dishes || 'Sin platillos'}</Text>
                </View>
              );
            })}
          </TouchableOpacity>
        )}

        {selectedDate && !selectedRotation && (
          <View style={styles.noMealCard}>
            <Text style={styles.noMealText}>Día de descanso</Text>
          </View>
        )}

        {/* Templates section */}
        {templates.length > 0 && (
          <View style={styles.templatesSection}>
            <Text style={styles.sectionHeader}>Mis plantillas</Text>
            {templates.map((t, idx) => (
              <TemplateCard
                key={t.id}
                template={t}
                color={getTemplateColor(idx)}
                onPress={() => handleNavigateDetail(t.id)}
              />
            ))}
          </View>
        )}

        {templates.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={styles.emptyTitle}>Sin plantillas</Text>
            <Text style={styles.emptyBody}>
              Sube tus PDFs de dieta para crear plantillas y ver la rotación en el calendario.
            </Text>
          </View>
        )}

        {/* Legend */}
        {templates.length > 0 && (
          <View style={styles.legendSection}>
            {templates.map((t, idx) => (
              <View key={t.id} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: getTemplateColor(idx) }]} />
                <Text style={styles.legendLabel}>Plantilla {t.label}</Text>
              </View>
            ))}
            <View style={styles.legendItem}>
              <Text style={styles.legendLabel}>--- = Descanso (Domingo)</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
  },
  screenTitle: { fontSize: 22, fontWeight: '700', color: '#1B1B1B' },
  screenCount: { fontSize: 14, color: '#757575' },
  scrollContent: { paddingBottom: 32 },

  // Calendar
  calendarContainer: {
    backgroundColor: '#FFFFFF', marginHorizontal: 16, marginTop: 16,
    borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  monthArrow: { padding: 8 },
  monthArrowText: { fontSize: 24, color: '#2D6A4F', fontWeight: '600' },
  monthLabel: { fontSize: 17, fontWeight: '700', color: '#1B1B1B' },
  weekRow: { flexDirection: 'row' },
  weekCell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  weekLabel: { fontSize: 12, fontWeight: '600', color: '#9E9E9E' },
  dayCell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, minHeight: 48 },
  dayCellToday: { backgroundColor: '#E8F5E9', borderRadius: 10 },
  dayCellSelected: { backgroundColor: '#2D6A4F', borderRadius: 10 },
  dayText: { fontSize: 14, color: '#424242' },
  dayTextToday: { fontWeight: '700', color: '#2D6A4F' },
  dayTextSelected: { fontWeight: '700', color: '#FFFFFF' },
  dayTextRest: { color: '#BDBDBD' },
  labelBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginTop: 2 },
  labelBadgeText: { fontSize: 9, fontWeight: '700', color: '#FFFFFF' },
  restText: { fontSize: 9, color: '#BDBDBD', marginTop: 2 },

  // Detail card
  detailCard: {
    backgroundColor: '#FFFFFF', marginHorizontal: 16, marginTop: 12,
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  detailLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  detailBadgeText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  detailDate: { fontSize: 14, color: '#757575' },
  detailChevron: { fontSize: 14, color: '#2D6A4F', fontWeight: '600' },
  mealRow: { marginBottom: 6 },
  mealType: { fontSize: 13, fontWeight: '600', color: '#2D6A4F' },
  mealDishes: { fontSize: 13, color: '#616161', marginTop: 1 },
  noMealCard: {
    backgroundColor: '#FFFFFF', marginHorizontal: 16, marginTop: 12,
    borderRadius: 12, padding: 20, alignItems: 'center',
  },
  noMealText: { fontSize: 14, color: '#9E9E9E' },

  // Templates section
  templatesSection: { marginTop: 20, paddingHorizontal: 16 },
  sectionHeader: { fontSize: 16, fontWeight: '700', color: '#1B1B1B', marginBottom: 10 },
  templateCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12, marginBottom: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  templateBadge: {
    width: 36, height: 36, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  templateBadgeText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  templateBody: { flex: 1 },
  templateName: { fontSize: 14, fontWeight: '600', color: '#1B1B1B' },
  templateDishes: { fontSize: 13, color: '#616161', marginTop: 2 },
  inactiveLabel: { fontSize: 11, color: '#D32F2F', fontWeight: '600', marginTop: 2 },
  templateChevron: { fontSize: 20, color: '#BDBDBD', marginLeft: 8 },

  // Legend
  legendSection: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    paddingHorizontal: 16, marginTop: 16,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: '#757575' },

  // Empty
  emptyState: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 40 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1B1B1B', marginBottom: 8 },
  emptyBody: { fontSize: 15, color: '#757575', textAlign: 'center', lineHeight: 22 },
});
