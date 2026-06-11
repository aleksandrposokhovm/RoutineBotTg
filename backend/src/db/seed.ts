import prisma from './index';
import { getTodayDateInTz, localTimeToUTC, addDaysToDateStr } from '../services/timezone';

async function main() {
  console.log('🌱 Seeding database...');

  const timezone = 'Asia/Yekaterinburg';
  const today = getTodayDateInTz(timezone);

  // Calculate past/future dates
  const yesterday = addDaysToDateStr(today, -1);

  // 1. Create user with ID 1 for local development fallback
  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(1) },
    update: {},
    create: {
      telegramId: BigInt(1),
      firstName: 'Александр',
      lastName: 'Посохов',
      timezone: timezone,
    },
  });

  console.log(`👤 User created/upserted: ${user.firstName} ${user.lastName}`);

  // 2. Create nutrition profile
  const nutritionProfile = await prisma.nutritionProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      height: 180,
      weight: 78,
      age: 28,
      gender: 'male',
      activityLevel: 'active',
      goal: 'maintain',
      dailyCalories: 2450,
      dailyProtein: 160,
      dailyFat: 80,
      dailyCarbs: 270,
    },
  });

  console.log('📊 Nutrition profile seeded');

  // 3. Create schedule events
  await prisma.scheduleEvent.deleteMany({ where: { userId: user.id } });

  const events = [
    {
      title: 'Утреннее планирование',
      description: 'Созвон по планам на день',
      startTime: '09:30',
      endTime: '10:00',
    },
    {
      title: 'Встреча с командой MK Alliance',
      description: 'Обсуждение нового релиза',
      startTime: '13:00',
      endTime: '14:00',
    },
    {
      title: 'Спортзал',
      description: 'Силовая тренировка (грудь/спина)',
      startTime: '18:30',
      endTime: '20:00',
    },
  ];

  for (const e of events) {
    const startTimeUTC = localTimeToUTC(today, e.startTime, timezone);
    const endTimeUTC = localTimeToUTC(today, e.endTime, timezone);

    await prisma.scheduleEvent.create({
      data: {
        userId: user.id,
        title: e.title,
        description: e.description,
        startTimeUTC,
        endTimeUTC,
        createdInTz: timezone,
      },
    });
  }

  console.log(`📅 ${events.length} schedule events seeded`);

  // 4. Create plans (tasks)
  await prisma.plan.deleteMany({ where: { userId: user.id } });

  const plans = [
    {
      title: 'Купить спортивные витамины',
      description: 'Зайти в аптеку или заказать онлайн',
      date: today,
      completed: false,
      originalDate: today,
    },
    {
      title: 'Обновить README в репозитории',
      description: 'Дописать инструкцию по развертыванию',
      date: today,
      completed: true,
      completedAt: new Date(),
      originalDate: today,
    },
    {
      title: 'Подготовить отчет по питанию',
      description: 'Собрать статистику за неделю',
      date: yesterday,
      completed: false,
      originalDate: yesterday, // This task will be carried over because it's incomplete and dated in the past
    },
  ];

  for (const p of plans) {
    await prisma.plan.create({
      data: {
        userId: user.id,
        title: p.title,
        description: p.description,
        date: p.date,
        completed: p.completed,
        completedAt: p.completedAt,
        originalDate: p.originalDate,
      },
    });
  }

  console.log(`📋 ${plans.length} plans seeded`);

  // 5. Create diet entries
  await prisma.dietEntry.deleteMany({ where: { userId: user.id } });

  const dietEntries = [
    {
      name: 'Овсяная каша с бананом и медом',
      mealType: 'breakfast',
      date: today,
      calories: 420,
      protein: 12,
      fat: 8,
      carbs: 75,
      portionGrams: 300,
    },
    {
      name: 'Куриное филе с рисом и брокколи',
      mealType: 'lunch',
      date: today,
      calories: 650,
      protein: 48,
      fat: 14,
      carbs: 82,
      portionGrams: 450,
    },
    {
      name: 'Протеиновый батончик',
      mealType: 'snack',
      date: today,
      calories: 220,
      protein: 20,
      fat: 7,
      carbs: 18,
      portionGrams: 60,
    },
  ];

  for (const d of dietEntries) {
    await prisma.dietEntry.create({
      data: {
        userId: user.id,
        name: d.name,
        mealType: d.mealType,
        date: d.date,
        calories: d.calories,
        protein: d.protein,
        fat: d.fat,
        carbs: d.carbs,
        portionGrams: d.portionGrams,
      },
    });
  }

  console.log(`🍽 ${dietEntries.length} diet entries seeded`);

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
