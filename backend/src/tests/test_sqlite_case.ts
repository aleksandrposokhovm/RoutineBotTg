import prisma from '../db';

async function test() {
  const events = await prisma.scheduleEvent.findMany();
  console.log("Database contains events:", events.map(e => e.title));

  const query1 = 'созвон';
  const match1 = events.filter(e => e.title.toLowerCase().includes(query1.toLowerCase()));
  console.log(`In-memory search for '${query1}' found ${match1.length} events:`, match1.map(m => m.title));

  const query2 = 'Созвон';
  const match2 = events.filter(e => e.title.toLowerCase().includes(query2.toLowerCase()));
  console.log(`In-memory search for '${query2}' found ${match2.length} events:`, match2.map(m => m.title));
}

test().catch(console.error);
