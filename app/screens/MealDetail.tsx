import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useStore } from '../store/useStore';
import { MealsStackParamList, Meal, Dish, RawIngredient, MealTemplate } from '../types/index';

const MEAL_EMOJI: Record<string, string> = {
  'Al despertar': '🌅',
  Desayuno: '🥞',
  'Medio día': '🍎',
  Comida: '🍽',
  'Media tarde': '☕',
  Cena: '🌙',
};

function formatIngredient(ing: RawIngredient): string {
  let text = ing.name;
  if (ing.quantity != null && ing.unit) {
    text += ` — ${ing.quantity}${ing.unit}`;
  } else if (ing.quantity != null) {
    text += ` — ${ing.quantity}`;
  }
  if (ing.quantity_alt) {
    text += ` (${ing.quantity_alt})`;
  }
  if (ing.notes) {
    text += ` · ${ing.notes}`;
  }
  return text;
}

function DishCard({ dish }: { dish: Dish }) {
  return (
    <View style={styles.dishCard}>
      <Text style={styles.dishName}>{dish.name}</Text>
      {dish.ingredients.map((ing, idx) => (
        <View key={idx} style={styles.ingredientRow}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.ingredientText}>{formatIngredient(ing)}</Text>
        </View>
      ))}
    </View>
  );
}

function MealSection({ meal }: { meal: Meal }) {
  const emoji = MEAL_EMOJI[meal.mealType] ?? '🍴';
  return (
    <View style={styles.mealSection}>
      <View style={styles.mealHeader}>
        <Text style={styles.mealEmoji}>{emoji}</Text>
        <Text style={styles.mealType}>{meal.mealType}</Text>
      </View>
      {meal.dishes.map((dish, idx) => (
        <DishCard key={idx} dish={dish} />
      ))}
    </View>
  );
}

export default function MealDetail() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MealsStackParamList, 'MealDetail'>>();
  const { templateId, date } = route.params;
  const { templates, mealDays } = useStore();

  // Find template by ID, or fall back to mealDays by date
  const template = templates.find((t) => t.id === templateId);
  const mealDay = template
    ? { meals: template.meals, raw_date_str: template.raw_date_str, confidence: template.confidence, warnings: template.warnings }
    : mealDays.find((d) => d.date === date);

  const displayDate = template
    ? `Plantilla ${template.label}`
    : mealDay?.raw_date_str ?? date ?? 'Sin fecha';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Atrás</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle} numberOfLines={1}>{displayDate}</Text>
        <View style={styles.backBtn} />
      </View>

      {!mealDay ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📅</Text>
          <Text style={styles.emptyTitle}>Sin plan para este día</Text>
          <Text style={styles.emptyBody}>
            No hay comidas registradas para esta plantilla.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {mealDay.confidence < 0.7 && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>
                Confianza de parseo: {Math.round(mealDay.confidence * 100)}%
              </Text>
            </View>
          )}

          {mealDay.meals.map((meal, idx) => (
            <MealSection key={idx} meal={meal} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backBtn: {
    width: 60,
  },
  backText: {
    fontSize: 16,
    color: '#2D6A4F',
    fontWeight: '600',
  },
  screenTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1B1B1B',
    textAlign: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  warningBanner: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  warningText: {
    fontSize: 13,
    color: '#E65100',
    textAlign: 'center',
  },
  mealSection: {
    marginBottom: 20,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  mealEmoji: {
    fontSize: 22,
    marginRight: 8,
  },
  mealType: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D6A4F',
  },
  dishCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  dishName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1B1B1B',
    marginBottom: 8,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    paddingLeft: 4,
  },
  bullet: {
    fontSize: 13,
    color: '#9E9E9E',
    marginRight: 8,
    marginTop: 1,
  },
  ingredientText: {
    flex: 1,
    fontSize: 13,
    color: '#424242',
    lineHeight: 19,
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
