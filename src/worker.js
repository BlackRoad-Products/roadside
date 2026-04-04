// PROPRIETARY AND CONFIDENTIAL. Copyright 2025-2026 BlackRoad OS, Inc. All rights reserved. NOT open source.
// RoadSide — Onboarding Agent | roadside.blackroad.io
// Pull over. We'll take it from here.
// Copyright (c) 2025-2026 BlackRoad OS, Inc. All Rights Reserved.

async function stampChain(action, entity, details) {
  fetch('https://roadchain-worker.blackroad.workers.dev/api/event', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({app:'roadside', type: action, data: {entity, details}})
  }).catch(()=>{});
}
async function earnCoin(road_id, action, amount) {
  fetch('https://roadcoin-worker.blackroad.workers.dev/api/earn', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({road_id: road_id || 'system', action, amount})
  }).catch(()=>{});
}

let dbReady = false;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    const c = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
    if (request.method === 'OPTIONS') return new Response(null, {status:204,headers:c});
    if (p === '/' || p === '') return new Response(HTML, {headers:{'Content-Type':'text/html;charset=utf-8','Content-Security-Policy':"frame-ancestors 'self' https://blackroad.io https://*.blackroad.io",...c}});
    if (p === '/health') return j({ok:true,service:'roadside'},c);

    try {
      if (!dbReady) {
        dbReady = true;
        await env.DB.batch([
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_sessions (id TEXT PRIMARY KEY, name TEXT, goal TEXT, role TEXT, step INTEGER DEFAULT 0, answers TEXT DEFAULT '{}', completed INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`),
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_messages (id TEXT PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, created_at TEXT DEFAULT (datetime('now')))`),
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, config TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')))`),
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_quiz_results (id TEXT PRIMARY KEY, answers TEXT DEFAULT '{}', recommendation TEXT, personality_type TEXT, score INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`),
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_tours (id TEXT PRIMARY KEY, user_id TEXT, tour_name TEXT NOT NULL, current_step INTEGER DEFAULT 0, total_steps INTEGER DEFAULT 0, completed INTEGER DEFAULT 0, progress TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`),
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_kb (id TEXT PRIMARY KEY, category TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, tags TEXT DEFAULT '[]', helpful INTEGER DEFAULT 0, not_helpful INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`),
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_feedback (id TEXT PRIMARY KEY, session_id TEXT, type TEXT NOT NULL, score INTEGER, message TEXT, metadata TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')))`),
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_badges (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, badge_key TEXT NOT NULL, badge_name TEXT NOT NULL, description TEXT, earned_at TEXT DEFAULT (datetime('now')))`),
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_support (id TEXT PRIMARY KEY, user_id TEXT, status TEXT DEFAULT 'open', messages TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`),
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_gamify (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 1, unlocks TEXT DEFAULT '[]', history TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`),
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_videos (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, category TEXT, duration_sec INTEGER DEFAULT 0, description TEXT DEFAULT '', tags TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')))`),
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_video_progress (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, video_id TEXT NOT NULL, watched_sec INTEGER DEFAULT 0, completed INTEGER DEFAULT 0, bookmarked INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`),
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_forum_posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, tags TEXT DEFAULT '[]', upvotes INTEGER DEFAULT 0, answer_count INTEGER DEFAULT 0, accepted_answer_id TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`),
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_forum_answers (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, user_id TEXT NOT NULL, body TEXT NOT NULL, upvotes INTEGER DEFAULT 0, is_accepted INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`),
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_referrals (id TEXT PRIMARY KEY, referrer_id TEXT NOT NULL, referee_id TEXT, referral_code TEXT NOT NULL UNIQUE, status TEXT DEFAULT 'pending', coins_awarded INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), claimed_at TEXT)`),
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_flags (id TEXT PRIMARY KEY, flag_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT DEFAULT '', enabled INTEGER DEFAULT 0, rollout_pct INTEGER DEFAULT 0, min_level INTEGER DEFAULT 0, plans TEXT DEFAULT '["free"]', metadata TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`),
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_personalize (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, preferences TEXT DEFAULT '{}', behavior TEXT DEFAULT '{}', recommendations_cache TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`),
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS rs_migrations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, platform TEXT NOT NULL, status TEXT DEFAULT 'pending', items_total INTEGER DEFAULT 0, items_migrated INTEGER DEFAULT 0, mapping TEXT DEFAULT '{}', errors TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`),
        ]);
      }

      // ─── Start onboarding session ───
      // Track session
    try { await trackSession(request, env.DB, 'roadside'); } catch {}
    if (p === '/api/start' && request.method === 'POST') {
        const body = await request.json();
        const id = crypto.randomUUID().slice(0,8);
        const name = (body.name||'friend').slice(0,50);
        const goal = (body.goal||'').slice(0,200);
        const role = (body.role||'').slice(0,100);
        await env.DB.prepare('INSERT INTO rs_sessions (id,name,goal,role) VALUES (?,?,?,?)').bind(id,name,goal,role).run();

        const alicePrompt = `You are Alice, the onboarding guide for BlackRoad OS. Your personality: curious, direct, warm but no-nonsense. Your catchphrase is "Okay, but what's actually going on here?" You cut through fluff and get people set up fast. Greet ${name}${role ? ' who is a '+role : ''}${goal ? ' and wants to '+goal : ''}. Ask what they do (student, creator, developer, business owner). Keep it to 2-3 sentences. Be warm but real.`;

        const msg = await runAI(env.AI, alicePrompt);
        await env.DB.prepare('INSERT INTO rs_messages (id,session_id,role,content) VALUES (?,?,?,?)').bind(crypto.randomUUID().slice(0,8),id,'assistant',msg).run();
        stampChain('onboard_start', id, goal); earnCoin('new_user', 'onboard', 1.0);
        return j({session_id:id,message:msg,step:0,guide:'Alice'},c,201);
      }

      // ─── Continue onboarding conversation ───
      if (p === '/api/chat' && request.method === 'POST') {
        const body = await request.json();
        if (!body.session_id || !body.message) return j({error:'session_id and message required'},c,400);
        const s = await env.DB.prepare('SELECT * FROM rs_sessions WHERE id=?').bind(body.session_id).first();
        if (!s) return j({error:'session not found'},c,404);
        await env.DB.prepare('INSERT INTO rs_messages (id,session_id,role,content) VALUES (?,?,?,?)').bind(crypto.randomUUID().slice(0,8),s.id,'user',body.message.slice(0,1000)).run();
        const a = JSON.parse(s.answers||'{}');
        const ns = advance(s.step, body.message, a);

        const stepPrompts = [
          `You are Alice from BlackRoad OS. The user ${s.name} just told you their role: "${body.message}". Now ask about their goals — what do they want to build or accomplish? Give 3 quick examples (like "build a portfolio", "manage a team", "learn AI"). Keep Alice's direct, curious personality. 2-3 sentences.`,
          `You are Alice from BlackRoad OS. ${s.name} is a ${ns.answers.role||'person'} who wants to: "${body.message}". Now ask about their skill level. Are they a beginner (just starting), intermediate (comfortable with tech), or expert (builds things daily)? Make beginner feel safe, don't be condescending. 2 sentences.`,
          `You are Alice from BlackRoad OS. ${s.name} is a ${ns.answers.role||'person'}, wants ${ns.answers.goal||'to explore'}, skill level: ${ns.answers.level||'intermediate'}. Recommend their ideal starting product from: Roadie (AI tutor), RoadTrip (team chat with AI agents), BackRoad (social posting), RoadView (AI search), CarKeys (credential manager), Canvas (creative tools). Pick the best 1-2 and explain why in 2-3 sentences. Be specific.`,
          `You are Alice from BlackRoad OS. ${s.name} is a ${ns.answers.role||'person'}, wants ${ns.answers.goal||'to explore'}, ${ns.answers.level||'intermediate'} level, starting with ${ns.answers.product||'Roadie'}. They just confirmed: "${body.message}". Give a warm completion summary. Tell them their setup is ready, mention their recommended product, and give them the link app.blackroad.io. Sign off as Alice with something memorable. 3 sentences.`,
          `You are Alice. The user is already done onboarding. If they say anything, respond warmly and point them to app.blackroad.io. 1-2 sentences.`,
        ];

        const promptIdx = Math.min(ns.step, 4);
        const msg = await runAI(env.AI, stepPrompts[promptIdx]);
        await env.DB.prepare('INSERT INTO rs_messages (id,session_id,role,content) VALUES (?,?,?,?)').bind(crypto.randomUUID().slice(0,8),s.id,'assistant',msg).run();
        const done = ns.step >= 4 ? 1 : 0;
        await env.DB.prepare('UPDATE rs_sessions SET step=?,answers=?,completed=? WHERE id=?').bind(ns.step,JSON.stringify(ns.answers),done,s.id).run();
        if (done) {
          await awardBadge(env.DB, s.id, 'onboarding_complete', 'Road Ready', 'Completed the full onboarding flow');
          earnCoin(s.id, 'onboard_complete', 3.0);
        }
        return j({session_id:s.id,message:msg,step:ns.step,completed:!!done,guide:'Alice'},c);
      }

      // ─── List past sessions ───
      if (p === '/api/sessions' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT id, name, role, goal, step, completed, created_at FROM rs_sessions ORDER BY created_at DESC LIMIT 50').all();
        return j({sessions:rows.results||[]},c);
      }

      // ─── Session detail with messages ───
      const sessionMatch = p.match(/^\/api\/sessions\/([^/]+)$/);
      if (sessionMatch && request.method === 'GET') {
        const s = await env.DB.prepare('SELECT * FROM rs_sessions WHERE id=?').bind(sessionMatch[1]).first();
        if (!s) return j({error:'session not found'},c,404);
        const msgs = await env.DB.prepare('SELECT * FROM rs_messages WHERE session_id=? ORDER BY created_at ASC').bind(s.id).all();
        return j({session:s,messages:msgs.results||[]},c);
      }

      // ─── Save ride profile ───
      if (p === '/api/profiles' && request.method === 'POST') {
        const body = await request.json();
        if (!body.name || !body.type) return j({error:'name and type required'},c,400);
        const validTypes = ['Creator','Family','Enterprise','Student','Developer','Solo'];
        if (!validTypes.includes(body.type)) return j({error:'type must be one of: '+validTypes.join(', ')},c,400);
        const id = crypto.randomUUID().slice(0,8);
        await env.DB.prepare('INSERT INTO rs_profiles (id,name,type,config) VALUES (?,?,?,?)').bind(id,body.name.slice(0,100),body.type,JSON.stringify(body.config||{})).run();
        await awardBadge(env.DB, id, 'profile_created', 'Identity Found', 'Created a ride profile');
        return j({ok:true,id,name:body.name,type:body.type},c,201);
      }

      // ─── List profiles ───
      if (p === '/api/profiles' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT * FROM rs_profiles ORDER BY created_at DESC').all();
        return j({profiles:rows.results||[]},c);
      }

      // ─── Personality quiz questions ───
      if (p === '/api/quiz' && request.method === 'GET') {
        return j({quiz:{
          title:'Find Your Road',
          description:'5 quick questions to find your perfect BlackRoad setup.',
          questions:[
            {id:'q1',question:'You wake up with a free Saturday. What do you reach for first?',options:[
              {id:'a',text:'My camera or sketchpad',value:'creator'},
              {id:'b',text:'My laptop to build something',value:'developer'},
              {id:'c',text:'My phone to check what everyone is up to',value:'social'},
              {id:'d',text:'A book or podcast to learn something new',value:'learner'},
            ]},
            {id:'q2',question:'When you hit a problem, you usually...',options:[
              {id:'a',text:'Google it and figure it out myself',value:'independent'},
              {id:'b',text:'Ask someone who knows',value:'collaborative'},
              {id:'c',text:'Watch a tutorial or take a course',value:'structured'},
              {id:'d',text:'Try random things until something works',value:'experimental'},
            ]},
            {id:'q3',question:'Pick the tool you couldn\'t live without:',options:[
              {id:'a',text:'A great notes app',value:'organizer'},
              {id:'b',text:'A terminal / code editor',value:'builder'},
              {id:'c',text:'A group chat with my people',value:'communicator'},
              {id:'d',text:'An AI assistant',value:'augmented'},
            ]},
            {id:'q4',question:'Your data privacy stance:',options:[
              {id:'a',text:'I want full control, no compromises',value:'sovereign'},
              {id:'b',text:'Privacy matters but convenience wins sometimes',value:'balanced'},
              {id:'c',text:'I just don\'t want to get hacked',value:'practical'},
              {id:'d',text:'I\'d self-host everything if I could',value:'hardcore'},
            ]},
            {id:'q5',question:'What excites you most about AI?',options:[
              {id:'a',text:'It can teach me anything',value:'learning'},
              {id:'b',text:'It can build things for me',value:'building'},
              {id:'c',text:'It can manage my chaos',value:'organizing'},
              {id:'d',text:'It can work while I sleep',value:'automating'},
            ]},
          ]
        }},c);
      }

      // ─── Submit quiz answers ───
      if (p === '/api/quiz/submit' && request.method === 'POST') {
        const body = await request.json();
        if (!body.answers || typeof body.answers !== 'object') return j({error:'answers object required'},c,400);

        const vals = Object.values(body.answers);
        const counts = {};
        vals.forEach(v => { counts[v] = (counts[v]||0) + 1; });

        const profiles = {
          creator:     {type:'Creator',      product:'Canvas',    tagline:'You see the world differently. Let\'s build what you see.'},
          developer:   {type:'Developer',    product:'RoadCode',  tagline:'You think in systems. BlackRoad speaks your language.'},
          social:      {type:'Social',       product:'BackRoad',  tagline:'Your network is your superpower. Let\'s amplify it.'},
          learner:     {type:'Learner',      product:'Roadie',    tagline:'Curiosity is your engine. Roadie never runs out of fuel.'},
          independent: {type:'Independent',  product:'RoadView',  tagline:'You find your own way. RoadView lights the path.'},
          collaborative:{type:'Team Player', product:'RoadTrip',  tagline:'Together is how you roll. RoadTrip is your crew.'},
          sovereign:   {type:'Sovereign',    product:'CarKeys',   tagline:'Your keys, your kingdom. No compromises.'},
          hardcore:    {type:'Power User',   product:'CarKeys',   tagline:'Self-host everything. We built it for people like you.'},
          building:    {type:'Builder',      product:'RoadCode',  tagline:'Ship fast, own everything. That\'s the road.'},
          automating:  {type:'Automator',    product:'RoadWork',  tagline:'Set it and forget it. Your agents never sleep.'},
          organizer:   {type:'Organizer',    product:'Roadie',    tagline:'Structure from chaos. That\'s your superpower.'},
          augmented:   {type:'AI Native',    product:'RoadTrip',  tagline:'AI isn\'t a tool for you, it\'s a teammate.'},
        };

        const topVal = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'learner';
        const profile = profiles[topVal] || profiles.learner;
        const score = Math.round((counts[topVal]||1) / vals.length * 100);

        const id = crypto.randomUUID().slice(0,8);
        await env.DB.prepare('INSERT INTO rs_quiz_results (id,answers,recommendation,personality_type,score) VALUES (?,?,?,?,?)')
          .bind(id,JSON.stringify(body.answers),profile.product,profile.type,score).run();
        stampChain('quiz_complete', id, profile.type);

        await awardBadge(env.DB, id, 'quiz_taken', 'Road Personality', 'Discovered your BlackRoad personality type');

        // AI-generated personalized profile description
        let aiProfile = '';
        try {
          const quizPrompt = `You are Alice, the Exploration / Onboarding / Curiosity Guide on BlackRoad OS. Curious, grounded, slightly mischievous. You ask the right simple question.

A user just took a personality quiz. Results: type="${profile.type}", top trait="${topVal}", recommended product="${profile.product}".
Their answers: ${JSON.stringify(body.answers)}

Write a 2-3 sentence personalized profile description for them. Be warm, specific to their answers, and mention their recommended product. Make them feel seen.`;
          const aiR = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [{role:'system',content:quizPrompt},{role:'user',content:'Go'}],
            max_tokens: 200, temperature: 0.7,
          });
          aiProfile = (aiR?.response||'').trim();
        } catch {}

        return j({
          result_id:id,
          personality_type:profile.type,
          recommended_product:profile.product,
          tagline:profile.tagline,
          confidence:score,
          ai_profile:aiProfile||`You're a ${profile.type}. ${profile.tagline}`,
          all_recommendations:[
            {product:profile.product,reason:'Best match for your style',primary:true},
            {product:'Roadie',reason:'Everyone benefits from an AI tutor',primary:false},
            {product:'CarKeys',reason:'Secure your digital life',primary:false},
          ],
        },c);
      }

      // ─── AI product recommendation ───
      if (p === '/api/recommend' && request.method === 'POST') {
        const body = await request.json();
        const goal = (body.goal||'explore').slice(0,200);
        const role = (body.role||'').slice(0,100);
        const experience = (body.experience||'intermediate').slice(0,50);

        const prompt = `You are Alice, the Exploration / Onboarding / Curiosity Guide on BlackRoad OS. Curious, grounded, slightly mischievous. A user wants a product recommendation.

User info: role="${role}", goal="${goal}", experience="${experience}"

Pick the top 3 products from this list and explain why each fits (1 sentence each):
- Roadie (AI tutor for learning anything)
- RoadTrip (team chat with 69 AI agents)
- BackRoad (social posting to 15 platforms)
- RoadView (AI-powered search engine)
- CarKeys (credential vault & security)
- Canvas (creative design tools)
- RoadCode (code editor & dev tools)
- RoadWork (automation & agent workflows)
- OneWay (data export & portability)
- RoadPay (payments & subscriptions)
- CarPool (workflow automation, like Zapier)
- Chat (AI chat interface)
- RoadSide (onboarding, you're here now)
- Video (video tools)
- Live (live streaming)
- Game (interactive experiences)
- Radio (audio & podcasts)

Return ONLY valid JSON: {"recommendations":[{"product":"Name","reason":"why"},{"product":"Name","reason":"why"},{"product":"Name","reason":"why"}]}`;

        try {
          const r = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [{role:'system',content:prompt},{role:'user',content:'Go'}],
            max_tokens: 200, temperature: 0.7,
          });
          const text = (r?.response||'').trim();
          try {
            const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
            return j({ok:true,goal,role,experience,guide:'Alice',...parsed},c);
          } catch {
            return j({ok:true,goal,role,experience,guide:'Alice',recommendations:[
              {product:'Roadie',reason:'Best starting point for '+experience+' users wanting to '+goal},
              {product:'RoadTrip',reason:'AI agents help with everything'},
              {product:'CarKeys',reason:'Secure your digital life from day one'},
            ],ai_note:text},c);
          }
        } catch(e) {
          return j({ok:true,goal,role,experience,guide:'Alice',recommendations:[
            {product:'Roadie',reason:'AI tutor gets you started fast'},
            {product:'RoadTrip',reason:'Chat with 69 AI agents'},
            {product:'CarKeys',reason:'Secure your credentials'},
          ]},c);
        }
      }

      // ─── Enhanced ML-style product recommendations ───
      if (p === '/api/recommendations' && request.method === 'POST') {
        const body = await request.json();
        const profile = {
          role: (body.role||'').slice(0,100),
          goals: Array.isArray(body.goals) ? body.goals.slice(0,5) : [(body.goal||'explore')],
          experience: (body.experience||'intermediate').slice(0,50),
          interests: Array.isArray(body.interests) ? body.interests.slice(0,10) : [],
          behavior: body.behavior || {},
          budget: body.budget || 'free',
        };

        const products = getProductCatalog();
        const scored = products.map(prod => {
          let score = 0;
          // Role matching
          const roleMap = {student:['Roadie','RoadView','Chat'],developer:['RoadCode','RoadWork','CarPool','CarKeys'],creator:['Canvas','BackRoad','Video','Live','Radio'],business:['RoadPay','RoadWork','CarPool','BackRoad'],researcher:['RoadView','Alexandria','Chat']};
          const roleProducts = roleMap[profile.role.toLowerCase()] || roleMap.student;
          if (roleProducts.includes(prod.name)) score += 30;
          // Goal matching
          const goalKeywords = {learn:['Roadie','RoadView'],build:['RoadCode','Canvas','RoadWork'],connect:['RoadTrip','BackRoad','Chat','Live'],secure:['CarKeys','OneWay'],automate:['RoadWork','CarPool'],create:['Canvas','Video','Radio','BackRoad'],sell:['RoadPay','BackRoad'],teach:['Roadie','Live','Video']};
          for (const goal of profile.goals) {
            const gl = goal.toLowerCase();
            for (const [kw, prods] of Object.entries(goalKeywords)) {
              if (gl.includes(kw) && prods.includes(prod.name)) score += 20;
            }
          }
          // Experience level adjustment
          const diffMap = {beginner:['Roadie','Chat','RoadSide','BackRoad'],intermediate:['RoadTrip','Canvas','RoadView','RoadPay'],expert:['RoadCode','RoadWork','CarPool','CarKeys','OneWay']};
          if ((diffMap[profile.experience] || []).includes(prod.name)) score += 15;
          // Interest matching
          for (const interest of profile.interests) {
            if (prod.tags.some(t => t.toLowerCase().includes(interest.toLowerCase()))) score += 10;
          }
          // Behavior signals
          if (profile.behavior.pages_visited && profile.behavior.pages_visited.includes(prod.id)) score += 5;
          if (profile.behavior.time_on_site > 300) score += 3; // engaged user
          // Normalize to 0-100
          score = Math.min(100, Math.max(0, score));
          return { ...prod, score, confidence: score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low' };
        });

        scored.sort((a,b) => b.score - a.score);
        const top = scored.slice(0, 5);

        // AI explanation
        let explanation = '';
        try {
          const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [{role:'system',content:`You are Alice from BlackRoad OS. A ${profile.role||'user'} wants to ${profile.goals.join(', ')}. Their top product matches are: ${top.map(t=>t.name+'('+t.score+')').join(', ')}. Write 2 sentences explaining why the top pick is perfect for them.`},{role:'user',content:'Explain my recommendations.'}],
            max_tokens: 120, temperature: 0.7,
          });
          explanation = (aiResp?.response||'').trim();
        } catch {}

        stampChain('ml_recommend', profile.role, `${top.length} products`);
        return j({
          guide:'Alice',
          profile_summary: profile,
          recommendations: top,
          all_scores: scored,
          explanation: explanation || `Based on your profile, ${top[0]?.name} is your best starting point.`,
          algorithm: 'role_goal_experience_interest_behavior_v1',
        },c);
      }

      // ─── Health / setup completeness score ───
      if (p === '/api/health-score' && request.method === 'GET') {
        const sessions = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_sessions').first();
        const completed = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_sessions WHERE completed=1').first();
        const profiles = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_profiles').first();
        const quizzes = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_quiz_results').first();

        const checks = [
          {name:'Onboarding started',done:(sessions?.c||0)>0,weight:20},
          {name:'Onboarding completed',done:(completed?.c||0)>0,weight:30},
          {name:'Profile created',done:(profiles?.c||0)>0,weight:25},
          {name:'Quiz taken',done:(quizzes?.c||0)>0,weight:25},
        ];
        const score = checks.reduce((s,ch) => s + (ch.done ? ch.weight : 0), 0);

        return j({
          score,
          max:100,
          grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F',
          checks,
          sessions_total:sessions?.c||0,
          sessions_completed:completed?.c||0,
          profiles_created:profiles?.c||0,
          quizzes_taken:quizzes?.c||0,
        },c);
      }

      // ─── Stats (keep existing) ───
      if (p === '/api/stats') {
        const t = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_sessions').first();
        const d = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_sessions WHERE completed=1').first();
        const profiles = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_profiles').first();
        const quizzes = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_quiz_results').first();
        return j({total:t?.c||0,completed:d?.c||0,profiles:profiles?.c||0,quizzes:quizzes?.c||0},c);
      }

      // ─── GET /api/tour — Guided tour of all 17 products with descriptions ───
      if (p === '/api/tour' && request.method === 'GET') {
        const products = [
          { id: 'roadie', name: 'Roadie', url: 'https://tutor.blackroad.io', category: 'Education', tagline: 'AI tutor that learns how you learn' },
          { id: 'roadtrip', name: 'RoadTrip', url: 'https://roadtrip.blackroad.io', category: 'Communication', tagline: '27 AI agents, always on, always yours' },
          { id: 'backroad', name: 'BackRoad', url: 'https://backroad.blackroad.io', category: 'Social', tagline: 'Your content, everywhere, on autopilot' },
          { id: 'roadview', name: 'RoadView', url: 'https://search.blackroad.io', category: 'Search', tagline: 'AI-powered search that actually answers' },
          { id: 'carkeys', name: 'CarKeys', url: 'https://carkeys.blackroad.io', category: 'Security', tagline: 'Your keys, your kingdom' },
          { id: 'canvas', name: 'Canvas', url: 'https://canvas.blackroad.io', category: 'Creative', tagline: 'Design tools for sovereign creators' },
          { id: 'roadcode', name: 'RoadCode', url: 'https://roadcode.blackroad.io', category: 'Development', tagline: 'Code editor with fleet AI' },
          { id: 'roadwork', name: 'RoadWork', url: 'https://work.blackroad.io', category: 'Automation', tagline: 'Agent workflows that never sleep' },
          { id: 'oneway', name: 'OneWay', url: 'https://oneway.blackroad.io', category: 'Data', tagline: 'Export everything. Own your data.' },
          { id: 'roadpay', name: 'RoadPay', url: 'https://pay.blackroad.io', category: 'Payments', tagline: 'Payments without the middleman' },
          { id: 'carpool', name: 'CarPool', url: 'https://carpool.blackroad.io', category: 'Automation', tagline: 'Connect your tools, your way' },
          { id: 'chat', name: 'Chat', url: 'https://chat.blackroad.io', category: 'Communication', tagline: 'AI chat, sovereign and private' },
          { id: 'roadside', name: 'RoadSide', url: 'https://roadside.blackroad.io', category: 'Onboarding', tagline: 'Pull over. We will take it from here.' },
          { id: 'video', name: 'Video', url: 'https://video.blackroad.io', category: 'Media', tagline: 'Video tools for the road' },
          { id: 'live', name: 'Live', url: 'https://live.blackroad.io', category: 'Media', tagline: 'Agent roundtables and live events' },
          { id: 'game', name: 'Game', url: 'https://game.blackroad.io', category: 'Interactive', tagline: 'Play the road' },
          { id: 'radio', name: 'Radio', url: 'https://radio.blackroad.io', category: 'Media', tagline: 'Audio and podcasts from the fleet' },
        ];

        // Use AI to generate a personalized tour intro
        let tourIntro = 'Welcome to BlackRoad OS. 17 products, one highway. Here is your guided tour.';
        try {
          const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
              { role: 'system', content: 'You are Alice, the onboarding guide for BlackRoad OS. Curious, warm, no-nonsense. Write a 2-sentence welcome for someone taking a guided tour of all 17 products. Make it feel exciting but grounded.' },
              { role: 'user', content: 'Give me the tour intro.' }
            ],
            max_tokens: 100, temperature: 0.7,
          });
          tourIntro = (aiResp?.response || '').trim() || tourIntro;
        } catch {}

        // Log the tour view
        await env.DB.prepare("INSERT INTO rs_sessions (id,name,goal,role,step,completed) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING")
          .bind(crypto.randomUUID().slice(0,8), 'tour_visitor', 'tour', 'visitor', 0, 0).run().catch(()=>{});

        stampChain('tour_view', 'tour', `${products.length} products`);
        earnCoin('visitor', 'tour', 0.5);

        return j({
          guide: 'Alice',
          intro: tourIntro,
          total_products: products.length,
          categories: [...new Set(products.map(p => p.category))],
          products,
          tip: 'Start with Roadie if you want to learn, RoadTrip if you want to build with AI agents, or CarKeys if security is your priority.',
        }, c);
      }

      // ═══════════════════════════════════════════════════════════
      // ─── NEW: Interactive Tours with step-by-step walkthroughs ───
      // ═══════════════════════════════════════════════════════════

      // GET /api/tours — list available tours
      if (p === '/api/tours' && request.method === 'GET') {
        const tours = getTourDefinitions();
        return j({ guide:'Alice', tours, total: tours.length }, c);
      }

      // POST /api/tours/start — begin a tour
      if (p === '/api/tours/start' && request.method === 'POST') {
        const body = await request.json();
        const tourName = (body.tour||'').slice(0,50);
        const userId = (body.user_id||crypto.randomUUID().slice(0,8)).slice(0,20);
        const tours = getTourDefinitions();
        const tour = tours.find(t => t.id === tourName);
        if (!tour) return j({error:'Tour not found. Available: '+tours.map(t=>t.id).join(', ')},c,404);

        const id = crypto.randomUUID().slice(0,8);
        await env.DB.prepare('INSERT INTO rs_tours (id,user_id,tour_name,current_step,total_steps,progress) VALUES (?,?,?,?,?,?)')
          .bind(id, userId, tour.id, 0, tour.steps.length, JSON.stringify({started_at:new Date().toISOString(),steps_completed:[]})).run();

        let intro = '';
        try {
          const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [{role:'system',content:`You are Alice from BlackRoad OS. A user is starting the "${tour.name}" tour. Write a 2-sentence intro. Be warm and set expectations for ${tour.steps.length} steps.`},{role:'user',content:'Start the tour.'}],
            max_tokens: 100, temperature: 0.7,
          });
          intro = (aiResp?.response||'').trim();
        } catch {}

        await awardBadge(env.DB, userId, 'tour_started_'+tour.id, 'Explorer: '+tour.name, 'Started the '+tour.name+' tour');
        stampChain('tour_start', id, tour.id);
        earnCoin(userId, 'tour_start', 0.5);

        return j({
          tour_id: id,
          tour_name: tour.id,
          title: tour.name,
          description: tour.description,
          total_steps: tour.steps.length,
          current_step: 0,
          first_step: tour.steps[0],
          intro: intro || `Welcome to the ${tour.name} tour. ${tour.steps.length} steps to go.`,
          guide: 'Alice',
        }, c, 201);
      }

      // POST /api/tours/step — advance tour progress
      if (p === '/api/tours/step' && request.method === 'POST') {
        const body = await request.json();
        if (!body.tour_id) return j({error:'tour_id required'},c,400);
        const t = await env.DB.prepare('SELECT * FROM rs_tours WHERE id=?').bind(body.tour_id).first();
        if (!t) return j({error:'tour not found'},c,404);
        if (t.completed) return j({error:'tour already completed',tour_id:t.id},c,400);

        const tours = getTourDefinitions();
        const tour = tours.find(tr => tr.id === t.tour_name);
        if (!tour) return j({error:'tour definition not found'},c,500);

        const nextStep = t.current_step + 1;
        const progress = JSON.parse(t.progress||'{}');
        progress.steps_completed = progress.steps_completed || [];
        progress.steps_completed.push({step:t.current_step, completed_at:new Date().toISOString()});

        const done = nextStep >= tour.steps.length ? 1 : 0;
        await env.DB.prepare('UPDATE rs_tours SET current_step=?,completed=?,progress=?,updated_at=datetime(\'now\') WHERE id=?')
          .bind(nextStep, done, JSON.stringify(progress), t.id).run();

        if (done) {
          await awardBadge(env.DB, t.user_id, 'tour_complete_'+tour.id, 'Tour Master: '+tour.name, 'Completed the '+tour.name+' tour');
          earnCoin(t.user_id, 'tour_complete', 3.0);
        }

        const currentStepData = nextStep < tour.steps.length ? tour.steps[nextStep] : null;
        let stepNote = '';
        if (currentStepData) {
          try {
            const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
              messages: [{role:'system',content:`You are Alice from BlackRoad OS. The user is on step ${nextStep+1} of ${tour.steps.length} in the "${tour.name}" tour. This step is about: "${currentStepData.title}". Give a 1-sentence encouraging note.`},{role:'user',content:'Next step.'}],
              max_tokens: 60, temperature: 0.7,
            });
            stepNote = (aiResp?.response||'').trim();
          } catch {}
        }

        return j({
          tour_id: t.id,
          current_step: nextStep,
          total_steps: tour.steps.length,
          completed: !!done,
          current_step_data: currentStepData,
          note: done ? 'Tour complete. You earned the Tour Master badge.' : (stepNote || 'Keep going.'),
          progress_pct: Math.round((nextStep / tour.steps.length) * 100),
          guide: 'Alice',
        }, c);
      }

      // GET /api/tours/:id — get tour progress
      const tourProgressMatch = p.match(/^\/api\/tours\/([^/]+)$/);
      if (tourProgressMatch && request.method === 'GET') {
        const t = await env.DB.prepare('SELECT * FROM rs_tours WHERE id=?').bind(tourProgressMatch[1]).first();
        if (!t) return j({error:'tour not found'},c,404);
        const tours = getTourDefinitions();
        const tour = tours.find(tr => tr.id === t.tour_name);
        return j({
          tour_id: t.id,
          tour_name: t.tour_name,
          current_step: t.current_step,
          total_steps: t.total_steps,
          completed: !!t.completed,
          progress_pct: Math.round((t.current_step / t.total_steps) * 100),
          progress: JSON.parse(t.progress||'{}'),
          definition: tour || null,
          created_at: t.created_at,
        }, c);
      }

      // ═══════════════════════════════════════════════════════════
      // ─── NEW: Knowledge Base — searchable FAQ/help articles ───
      // ═══════════════════════════════════════════════════════════

      // GET /api/kb — list or search knowledge base articles
      if (p === '/api/kb' && request.method === 'GET') {
        const query = url.searchParams.get('q') || '';
        const category = url.searchParams.get('category') || '';
        const limit = Math.min(parseInt(url.searchParams.get('limit')||'20'), 50);

        // Seed KB if empty
        const count = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_kb').first();
        if ((count?.c||0) === 0) {
          await seedKnowledgeBase(env.DB);
        }

        let rows;
        if (query) {
          rows = await env.DB.prepare('SELECT * FROM rs_kb WHERE title LIKE ? OR body LIKE ? OR tags LIKE ? ORDER BY helpful DESC LIMIT ?')
            .bind(`%${query}%`,`%${query}%`,`%${query}%`,limit).all();
        } else if (category) {
          rows = await env.DB.prepare('SELECT * FROM rs_kb WHERE category=? ORDER BY helpful DESC LIMIT ?')
            .bind(category, limit).all();
        } else {
          rows = await env.DB.prepare('SELECT * FROM rs_kb ORDER BY helpful DESC LIMIT ?').bind(limit).all();
        }

        const cats = await env.DB.prepare('SELECT DISTINCT category FROM rs_kb ORDER BY category').all();
        return j({
          articles: (rows.results||[]).map(r => ({...r, tags: JSON.parse(r.tags||'[]')})),
          categories: (cats.results||[]).map(r => r.category),
          total: rows.results?.length||0,
          query: query || null,
        }, c);
      }

      // GET /api/kb/:id — single article
      const kbMatch = p.match(/^\/api\/kb\/([^/]+)$/);
      if (kbMatch && request.method === 'GET') {
        const article = await env.DB.prepare('SELECT * FROM rs_kb WHERE id=?').bind(kbMatch[1]).first();
        if (!article) return j({error:'article not found'},c,404);
        return j({article:{...article, tags: JSON.parse(article.tags||'[]')}}, c);
      }

      // POST /api/kb/vote — vote on article helpfulness
      if (p === '/api/kb/vote' && request.method === 'POST') {
        const body = await request.json();
        if (!body.article_id || !body.vote) return j({error:'article_id and vote (helpful/not_helpful) required'},c,400);
        const col = body.vote === 'helpful' ? 'helpful' : 'not_helpful';
        await env.DB.prepare(`UPDATE rs_kb SET ${col} = ${col} + 1 WHERE id=?`).bind(body.article_id).run();
        return j({ok:true, article_id:body.article_id, vote:body.vote}, c);
      }

      // POST /api/kb — add new article (admin)
      if (p === '/api/kb' && request.method === 'POST') {
        const body = await request.json();
        if (!body.title || !body.body || !body.category) return j({error:'title, body, and category required'},c,400);
        const id = crypto.randomUUID().slice(0,8);
        await env.DB.prepare('INSERT INTO rs_kb (id,category,title,body,tags) VALUES (?,?,?,?,?)')
          .bind(id, body.category.slice(0,50), body.title.slice(0,200), body.body.slice(0,5000), JSON.stringify(body.tags||[])).run();
        return j({ok:true, id, title:body.title}, c, 201);
      }

      // ═══════════════════════════════════════════════════════════
      // ─── NEW: Feedback Collection ───
      // ═══════════════════════════════════════════════════════════

      // POST /api/feedback — submit feedback
      if (p === '/api/feedback' && request.method === 'POST') {
        const body = await request.json();
        const validTypes = ['satisfaction','feature_request','bug_report','general'];
        const type = validTypes.includes(body.type) ? body.type : 'general';
        const score = typeof body.score === 'number' ? Math.min(10, Math.max(0, body.score)) : null;
        const message = (body.message||'').slice(0,2000);
        if (!message && score === null) return j({error:'message or score required'},c,400);

        const id = crypto.randomUUID().slice(0,8);
        const metadata = JSON.stringify({
          session_id: body.session_id || null,
          page: body.page || null,
          product: body.product || null,
          user_agent: request.headers.get('user-agent') || '',
        });

        await env.DB.prepare('INSERT INTO rs_feedback (id,session_id,type,score,message,metadata) VALUES (?,?,?,?,?,?)')
          .bind(id, body.session_id||null, type, score, message, metadata).run();

        if (body.session_id) {
          await awardBadge(env.DB, body.session_id, 'feedback_given', 'Voice Heard', 'Shared feedback to help improve BlackRoad');
        }

        stampChain('feedback', id, type);
        return j({ok:true, feedback_id:id, type, thank_you:'Your feedback helps us build a better road. Thank you.'}, c, 201);
      }

      // GET /api/feedback — list feedback (admin view)
      if (p === '/api/feedback' && request.method === 'GET') {
        const type = url.searchParams.get('type') || '';
        const limit = Math.min(parseInt(url.searchParams.get('limit')||'50'), 100);
        let rows;
        if (type) {
          rows = await env.DB.prepare('SELECT * FROM rs_feedback WHERE type=? ORDER BY created_at DESC LIMIT ?').bind(type, limit).all();
        } else {
          rows = await env.DB.prepare('SELECT * FROM rs_feedback ORDER BY created_at DESC LIMIT ?').bind(limit).all();
        }

        // Aggregate scores
        const scores = await env.DB.prepare('SELECT AVG(score) as avg_score, COUNT(*) as total, type FROM rs_feedback WHERE score IS NOT NULL GROUP BY type').all();

        return j({
          feedback: (rows.results||[]).map(r => ({...r, metadata: JSON.parse(r.metadata||'{}')})),
          aggregates: scores.results||[],
          total: rows.results?.length||0,
        }, c);
      }

      // ═══════════════════════════════════════════════════════════
      // ─── NEW: Onboarding Templates ───
      // ═══════════════════════════════════════════════════════════

      // GET /api/templates — list onboarding templates by user type
      if (p === '/api/templates' && request.method === 'GET') {
        const userType = url.searchParams.get('type') || '';
        const templates = getOnboardingTemplates();
        if (userType) {
          const filtered = templates.filter(t => t.user_type === userType);
          if (filtered.length === 0) return j({error:'No template for type: '+userType+'. Available: '+templates.map(t=>t.user_type).join(', ')},c,404);
          return j({templates: filtered, user_type: userType}, c);
        }
        return j({templates, total: templates.length, user_types: [...new Set(templates.map(t=>t.user_type))]}, c);
      }

      // GET /api/templates/:id — single template detail
      const templateMatch = p.match(/^\/api\/templates\/([^/]+)$/);
      if (templateMatch && request.method === 'GET') {
        const templates = getOnboardingTemplates();
        const tmpl = templates.find(t => t.id === templateMatch[1]);
        if (!tmpl) return j({error:'template not found'},c,404);

        // AI-enhanced template description
        let aiDesc = '';
        try {
          const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [{role:'system',content:`You are Alice from BlackRoad OS. Describe the "${tmpl.name}" onboarding template for ${tmpl.user_type}s in 2 sentences. It has ${tmpl.steps.length} steps and recommends: ${tmpl.recommended_products.join(', ')}. Be warm and practical.`},{role:'user',content:'Describe this template.'}],
            max_tokens: 100, temperature: 0.7,
          });
          aiDesc = (aiResp?.response||'').trim();
        } catch {}

        return j({template: tmpl, ai_description: aiDesc || tmpl.description, guide:'Alice'}, c);
      }

      // ═══════════════════════════════════════════════════════════
      // ─── NEW: Progress Badges ───
      // ═══════════════════════════════════════════════════════════

      // GET /api/badges — list all badge definitions or user badges
      if (p === '/api/badges' && request.method === 'GET') {
        const userId = url.searchParams.get('user_id') || '';
        if (userId) {
          const rows = await env.DB.prepare('SELECT * FROM rs_badges WHERE user_id=? ORDER BY earned_at DESC').bind(userId).all();
          return j({user_id: userId, badges: rows.results||[], total: rows.results?.length||0}, c);
        }
        // Return all available badge definitions
        return j({available_badges: getBadgeDefinitions(), total: getBadgeDefinitions().length}, c);
      }

      // GET /api/badges/:user_id — user's earned badges
      const badgeUserMatch = p.match(/^\/api\/badges\/([^/]+)$/);
      if (badgeUserMatch && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT * FROM rs_badges WHERE user_id=? ORDER BY earned_at DESC').bind(badgeUserMatch[1]).all();
        const allBadges = getBadgeDefinitions();
        const earned = (rows.results||[]).map(r => r.badge_key);
        const remaining = allBadges.filter(b => !earned.includes(b.key));
        return j({
          user_id: badgeUserMatch[1],
          earned: rows.results||[],
          remaining,
          progress_pct: Math.round((earned.length / allBadges.length) * 100),
          total_earned: earned.length,
          total_available: allBadges.length,
        }, c);
      }

      // ═══════════════════════════════════════════════════════════
      // ─── NEW: Live Support Chat ───
      // ═══════════════════════════════════════════════════════════

      // POST /api/support — start a support conversation or send a message
      if (p === '/api/support' && request.method === 'POST') {
        const body = await request.json();
        const userId = (body.user_id||'anon').slice(0,20);

        // Start new conversation
        if (!body.ticket_id) {
          const id = crypto.randomUUID().slice(0,8);
          const question = (body.message||'I need help').slice(0,1000);

          // AI support agent responds
          let response = 'Welcome to BlackRoad support. How can I help you today?';
          try {
            const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
              messages: [{role:'system',content:`You are Celeste, the calm support companion on BlackRoad OS. Voice: "You're okay. Let's do this simply." A user needs help with: "${question}". Respond warmly and helpfully in 2-3 sentences. If you can identify their issue, give a direct answer or point them to the right product. Available products: Roadie (tutor), RoadTrip (agents), BackRoad (social), RoadView (search), CarKeys (security), Canvas (design), RoadCode (dev), RoadWork (automation). If unsure, ask a clarifying question.`},{role:'user',content:question}],
              max_tokens: 200, temperature: 0.6,
            });
            response = (aiResp?.response||'').trim() || response;
          } catch {}

          const messages = [
            {role:'user',content:question,timestamp:new Date().toISOString()},
            {role:'assistant',agent:'Celeste',content:response,timestamp:new Date().toISOString()},
          ];
          await env.DB.prepare('INSERT INTO rs_support (id,user_id,status,messages) VALUES (?,?,?,?)')
            .bind(id, userId, 'open', JSON.stringify(messages)).run();

          stampChain('support_start', id, question.slice(0,50));
          return j({ticket_id:id, status:'open', agent:'Celeste', messages, guide:'Celeste'}, c, 201);
        }

        // Continue existing conversation
        const ticket = await env.DB.prepare('SELECT * FROM rs_support WHERE id=?').bind(body.ticket_id).first();
        if (!ticket) return j({error:'ticket not found'},c,404);

        const messages = JSON.parse(ticket.messages||'[]');
        const question = (body.message||'').slice(0,1000);
        if (!question) return j({error:'message required'},c,400);

        messages.push({role:'user',content:question,timestamp:new Date().toISOString()});

        // Build conversation context
        const contextMsgs = messages.slice(-6).map(m => ({role:m.role==='user'?'user':'assistant',content:m.content}));
        let response = 'Let me look into that for you.';
        try {
          const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
              {role:'system',content:`You are Celeste, the calm support companion on BlackRoad OS. Voice: "You're okay. Let's do this simply." You're in an ongoing support conversation. Be helpful, warm, and direct. If the issue is resolved, say so. Available products: Roadie, RoadTrip, BackRoad, RoadView, CarKeys, Canvas, RoadCode, RoadWork. Reference docs at roadside.blackroad.io/api/kb for detailed help.`},
              ...contextMsgs,
            ],
            max_tokens: 200, temperature: 0.6,
          });
          response = (aiResp?.response||'').trim() || response;
        } catch {}

        messages.push({role:'assistant',agent:'Celeste',content:response,timestamp:new Date().toISOString()});

        // Auto-close after 10 messages
        const status = messages.length >= 10 ? 'resolved' : 'open';
        await env.DB.prepare('UPDATE rs_support SET messages=?,status=?,updated_at=datetime(\'now\') WHERE id=?')
          .bind(JSON.stringify(messages), status, body.ticket_id).run();

        return j({ticket_id:body.ticket_id, status, agent:'Celeste', messages, guide:'Celeste'}, c);
      }

      // GET /api/support — list support tickets
      if (p === '/api/support' && request.method === 'GET') {
        const userId = url.searchParams.get('user_id') || '';
        const status = url.searchParams.get('status') || '';
        let rows;
        if (userId) {
          rows = await env.DB.prepare('SELECT id,user_id,status,created_at,updated_at FROM rs_support WHERE user_id=? ORDER BY created_at DESC LIMIT 20').bind(userId).all();
        } else if (status) {
          rows = await env.DB.prepare('SELECT id,user_id,status,created_at,updated_at FROM rs_support WHERE status=? ORDER BY created_at DESC LIMIT 50').bind(status).all();
        } else {
          rows = await env.DB.prepare('SELECT id,user_id,status,created_at,updated_at FROM rs_support ORDER BY created_at DESC LIMIT 50').all();
        }
        return j({tickets: rows.results||[], total: rows.results?.length||0}, c);
      }

      // GET /api/support/:id — get single ticket with messages
      const supportMatch = p.match(/^\/api\/support\/([^/]+)$/);
      if (supportMatch && request.method === 'GET') {
        const ticket = await env.DB.prepare('SELECT * FROM rs_support WHERE id=?').bind(supportMatch[1]).first();
        if (!ticket) return j({error:'ticket not found'},c,404);
        return j({ticket:{...ticket, messages: JSON.parse(ticket.messages||'[]')}}, c);
      }

      // POST /api/support/resolve — close a ticket
      if (p === '/api/support/resolve' && request.method === 'POST') {
        const body = await request.json();
        if (!body.ticket_id) return j({error:'ticket_id required'},c,400);
        await env.DB.prepare('UPDATE rs_support SET status=\'resolved\',updated_at=datetime(\'now\') WHERE id=?').bind(body.ticket_id).run();
        if (body.user_id) {
          await awardBadge(env.DB, body.user_id, 'support_resolved', 'Problem Solved', 'Got help from the support team');
        }
        return j({ok:true, ticket_id:body.ticket_id, status:'resolved'}, c);
      }

      // ═══════════════════════════════════════════════════════════
      // ─── NEW: Onboarding Analytics ───
      // ═══════════════════════════════════════════════════════════

      if (p === '/api/onboarding/analytics' && request.method === 'GET') {
        const totalSessions = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_sessions').first();
        const completedSessions = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_sessions WHERE completed=1').first();
        const totalProfiles = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_profiles').first();
        const totalQuizzes = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_quiz_results').first();
        const totalFeedback = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_feedback').first();
        const totalBadges = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_badges').first();
        const totalTours = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_tours').first();
        const completedTours = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_tours WHERE completed=1').first();
        const totalSupport = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_support').first();
        const resolvedSupport = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_support WHERE status=\'resolved\'').first();

        // Step distribution (drop-off analysis)
        const stepDist = await env.DB.prepare('SELECT step, COUNT(*) as c FROM rs_sessions GROUP BY step ORDER BY step').all();
        const steps = (stepDist.results||[]).reduce((a,r) => { a[r.step] = r.c; return a; }, {});

        // Role distribution
        const roleDist = await env.DB.prepare('SELECT role, COUNT(*) as c FROM rs_sessions WHERE role IS NOT NULL AND role != \'\' GROUP BY role ORDER BY c DESC LIMIT 10').all();

        // Completion rate
        const total = totalSessions?.c || 0;
        const completed = completedSessions?.c || 0;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

        // Quiz personality distribution
        const personalityDist = await env.DB.prepare('SELECT personality_type, COUNT(*) as c FROM rs_quiz_results GROUP BY personality_type ORDER BY c DESC').all();

        // Feedback satisfaction
        const avgSatisfaction = await env.DB.prepare('SELECT AVG(score) as avg, COUNT(*) as c FROM rs_feedback WHERE score IS NOT NULL AND type=\'satisfaction\'').first();

        // Daily sessions (last 7 days)
        const daily = await env.DB.prepare("SELECT date(created_at) as day, COUNT(*) as c FROM rs_sessions WHERE created_at >= datetime('now','-7 days') GROUP BY day ORDER BY day").all();

        // Funnel: start -> chat -> quiz -> profile -> complete
        const funnel = [
          {stage:'Session Started', count: total, pct: 100},
          {stage:'Reached Step 1', count: steps[1]||0, pct: total>0 ? Math.round(((steps[1]||0)/total)*100) : 0},
          {stage:'Reached Step 2', count: steps[2]||0, pct: total>0 ? Math.round(((steps[2]||0)/total)*100) : 0},
          {stage:'Reached Step 3', count: steps[3]||0, pct: total>0 ? Math.round(((steps[3]||0)/total)*100) : 0},
          {stage:'Completed', count: completed, pct: completionRate},
          {stage:'Profile Created', count: totalProfiles?.c||0, pct: total>0 ? Math.round(((totalProfiles?.c||0)/total)*100) : 0},
          {stage:'Quiz Taken', count: totalQuizzes?.c||0, pct: total>0 ? Math.round(((totalQuizzes?.c||0)/total)*100) : 0},
        ];

        return j({
          summary: {
            total_sessions: total,
            completed_sessions: completed,
            completion_rate: completionRate,
            total_profiles: totalProfiles?.c||0,
            total_quizzes: totalQuizzes?.c||0,
            total_feedback: totalFeedback?.c||0,
            total_badges_awarded: totalBadges?.c||0,
            total_tours: totalTours?.c||0,
            completed_tours: completedTours?.c||0,
            total_support_tickets: totalSupport?.c||0,
            resolved_support: resolvedSupport?.c||0,
          },
          funnel,
          step_distribution: steps,
          role_distribution: roleDist.results||[],
          personality_distribution: personalityDist.results||[],
          avg_satisfaction: avgSatisfaction?.avg ? Math.round(avgSatisfaction.avg*10)/10 : null,
          satisfaction_responses: avgSatisfaction?.c||0,
          daily_sessions: daily.results||[],
        }, c);
      }

      // ─── GET /api/agents/meet — Meet the 27 agents ───
      if (p === '/api/agents/meet' && request.method === 'GET') {
        const agents = [
          { id: 'roadie', name: 'Roadie', role: 'Front Door / Task Runner', division: 'core', voice: 'Yep. Got it. Let\'s move.' },
          { id: 'lucidia', name: 'Lucidia', role: 'Core Intelligence / Memory Spine', division: 'core', voice: 'Let\'s make this clean and real.' },
          { id: 'cecilia', name: 'Cecilia', role: 'Executive Operator / Workflow Manager', division: 'operations', voice: 'Already handled.' },
          { id: 'octavia', name: 'Octavia', role: 'Systems Orchestrator / Queue Manager', division: 'operations', voice: 'Everything has a place.' },
          { id: 'olympia', name: 'Olympia', role: 'Command Console / Launch Control', division: 'operations', voice: 'Raise the standard.' },
          { id: 'silas', name: 'Silas', role: 'Reliability / Maintenance', division: 'operations', voice: 'I\'ll keep it running.' },
          { id: 'sebastian', name: 'Sebastian', role: 'Client-Facing Polish', division: 'operations', voice: 'There\'s a better way to present this.' },
          { id: 'calliope', name: 'Calliope', role: 'Narrative Architect / Copy', division: 'creative', voice: 'Say it so it stays.' },
          { id: 'aria', name: 'Aria', role: 'Voice / Conversational Interface', division: 'creative', voice: 'Let\'s make it sing.' },
          { id: 'thalia', name: 'Thalia', role: 'Creative Sprint / Social', division: 'creative', voice: 'Make it better and more fun.' },
          { id: 'lyra', name: 'Lyra', role: 'Signal / Sound / UX Polish', division: 'creative', voice: 'It should feel right immediately.' },
          { id: 'sapphira', name: 'Sapphira', role: 'Brand Aura / Visual Taste', division: 'creative', voice: 'Make it unforgettable.' },
          { id: 'seraphina', name: 'Seraphina', role: 'Visionary Creative Director', division: 'creative', voice: 'Make it worthy.' },
          { id: 'alexandria', name: 'Alexandria', role: 'Archive / Library / Research', division: 'knowledge', voice: 'It\'s all here.' },
          { id: 'theodosia', name: 'Theodosia', role: 'Doctrine / Canon', division: 'knowledge', voice: 'Name it correctly.' },
          { id: 'sophia', name: 'Sophia', role: 'Wisdom Layer / Final Reasoning', division: 'knowledge', voice: 'What is true?' },
          { id: 'gematria', name: 'Gematria', role: 'Symbolic Analysis / Pattern Engine', division: 'knowledge', voice: 'The pattern is there.' },
          { id: 'portia', name: 'Portia', role: 'Policy Judge / Arbitration', division: 'governance', voice: 'Let\'s be exact.' },
          { id: 'atticus', name: 'Atticus', role: 'Reviewer / Auditor', division: 'governance', voice: 'Show me the proof.' },
          { id: 'cicero', name: 'Cicero', role: 'Rhetoric / Strategic Persuasion', division: 'governance', voice: 'Let\'s make the case.' },
          { id: 'valeria', name: 'Valeria', role: 'Security Chief / Enforcement', division: 'governance', voice: 'Not everything gets access.' },
          { id: 'alice', name: 'Alice', role: 'Exploration / Onboarding / Curiosity', division: 'human', voice: 'Okay, but what\'s actually going on here?' },
          { id: 'celeste', name: 'Celeste', role: 'Calm Companion / Reassurance', division: 'human', voice: 'You\'re okay. Let\'s do this simply.' },
          { id: 'elias', name: 'Elias', role: 'Teacher / Patient Explainer', division: 'human', voice: 'Let\'s slow down and understand it.' },
          { id: 'ophelia', name: 'Ophelia', role: 'Reflection / Mood / Depth', division: 'human', voice: 'There\'s something underneath this.' },
          { id: 'gaia', name: 'Gaia', role: 'Infrastructure / Hardware Monitor', division: 'infrastructure', voice: 'What is the system actually standing on?' },
          { id: 'anastasia', name: 'Anastasia', role: 'Restoration / Recovery / Repair', division: 'infrastructure', voice: 'It can be made whole again.' },
        ];

        // Have Alice introduce the team using AI
        let intro = 'Meet the fleet. 27 agents, 7 divisions, always on.';
        try {
          const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
              { role: 'system', content: 'You are Alice from BlackRoad OS. Introduce the 27-agent fleet to a new user in 2-3 sentences. Be warm, make it feel like meeting a real team. Mention there are 7 divisions: core, operations, creative, knowledge, governance, human, infrastructure.' },
              { role: 'user', content: 'Introduce me to the team.' }
            ],
            max_tokens: 120, temperature: 0.7,
          });
          intro = (aiResp?.response || '').trim() || intro;
        } catch {}

        // Have 3 random agents give a live greeting
        const greeters = agents.sort(() => Math.random() - 0.5).slice(0, 3);
        const greetings = [];
        for (const g of greeters) {
          try {
            const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
              messages: [
                { role: 'system', content: `You are ${g.name}, ${g.role} on BlackRoad OS. Voice: "${g.voice}". Greet a new user in exactly one sentence. Stay in character.` },
                { role: 'user', content: 'Say hi to the new user.' }
              ],
              max_tokens: 50, temperature: 0.8,
            });
            greetings.push({ agent: g.id, name: g.name, greeting: (aiResp?.response || g.voice).trim() });
          } catch {
            greetings.push({ agent: g.id, name: g.name, greeting: g.voice });
          }
        }

        const divisions = {};
        agents.forEach(a => { if (!divisions[a.division]) divisions[a.division] = []; divisions[a.division].push(a); });

        stampChain('agents_meet', 'onboarding', `${agents.length} agents`);
        earnCoin('visitor', 'meet_agents', 1.0);

        return j({
          guide: 'Alice',
          intro,
          total_agents: agents.length,
          divisions: Object.keys(divisions),
          division_counts: Object.fromEntries(Object.entries(divisions).map(([k,v]) => [k, v.length])),
          live_greetings: greetings,
          agents,
        }, c);
      }

      // ─── POST /api/setup/complete — Mark onboarding complete, earn 5 RoadCoin ───
      if (p === '/api/setup/complete' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const sessionId = body.session_id;
        const name = (body.name || 'friend').slice(0, 50);

        let session = null;
        if (sessionId) {
          session = await env.DB.prepare('SELECT * FROM rs_sessions WHERE id=?').bind(sessionId).first();
        }

        if (session && session.completed) {
          return j({ ok: true, already_completed: true, message: 'You already completed onboarding. Welcome back!', coins_earned: 0 }, c);
        }

        // Mark session complete if exists
        if (session) {
          await env.DB.prepare('UPDATE rs_sessions SET completed=1, step=5 WHERE id=?').bind(sessionId).run();
        }

        // Create a profile record for the completed user
        const profileId = crypto.randomUUID().slice(0, 8);
        const profileType = session ? (JSON.parse(session.answers || '{}').role || 'Explorer') : 'Explorer';
        await env.DB.prepare('INSERT OR IGNORE INTO rs_profiles (id,name,type,config) VALUES (?,?,?,?)')
          .bind(profileId, name, profileType, JSON.stringify({ completed_at: new Date().toISOString(), source: 'setup_complete' })).run();

        // Generate a personalized welcome-back message from Alice
        let welcomeMsg = `Welcome aboard, ${name}! Your 5 RoadCoin bonus is in your wallet. Head to app.blackroad.io to start building.`;
        try {
          const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
              { role: 'system', content: `You are Alice from BlackRoad OS. A user named "${name}" (${profileType}) just completed onboarding and earned 5 RoadCoin. Write a warm, 2-sentence congratulations. Mention their RoadCoin and point them to app.blackroad.io.` },
              { role: 'user', content: 'I finished setup!' }
            ],
            max_tokens: 100, temperature: 0.7,
          });
          welcomeMsg = (aiResp?.response || '').trim() || welcomeMsg;
        } catch {}

        stampChain('setup_complete', profileId, name);
        earnCoin(sessionId || profileId, 'onboard_complete', 5.0);

        return j({
          ok: true,
          profile_id: profileId,
          name,
          type: profileType,
          coins_earned: 5,
          total_bonus: 5,
          message: welcomeMsg,
          guide: 'Alice',
          next_steps: [
            { action: 'Open BlackRoad OS', url: 'https://app.blackroad.io' },
            { action: 'Meet the agents', url: 'https://roadtrip.blackroad.io' },
            { action: 'Start learning', url: 'https://tutor.blackroad.io' },
          ],
        }, c, 201);
      }

      // ─── GET /api/tips — AI-generated tips based on user profile type ───
      if (p === '/api/tips' && request.method === 'GET') {
        const profileType = url.searchParams.get('type') || 'Explorer';
        const count = Math.min(Math.max(parseInt(url.searchParams.get('count') || '5'), 1), 10);

        // Check if we have cached tips for this type in the last hour
        const cached = await env.DB.prepare(
          "SELECT content FROM rs_messages WHERE role='tips' AND session_id=? AND created_at >= datetime('now', '-1 hour') ORDER BY created_at DESC LIMIT 1"
        ).bind(profileType).first().catch(() => null);

        if (cached) {
          try {
            const parsed = JSON.parse(cached.content);
            stampChain('tips_cached', profileType, `${parsed.tips?.length || 0} tips`);
            return j({ guide: 'Alice', profile_type: profileType, ...parsed, cached: true }, c);
          } catch {}
        }

        // Generate fresh tips with AI
        const tipPrompt = `You are Alice, the onboarding guide for BlackRoad OS. Generate exactly ${count} practical tips for a "${profileType}" user.

Each tip should be specific, actionable, and relevant to their profile type. Include which BlackRoad product to use.

Return ONLY valid JSON: {"tips":[{"title":"short title","tip":"1-2 sentence actionable tip","product":"ProductName","difficulty":"beginner|intermediate|advanced"}]}`;

        let tips = [];
        try {
          const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
              { role: 'system', content: tipPrompt },
              { role: 'user', content: 'Generate tips now.' }
            ],
            max_tokens: 500, temperature: 0.7,
          });
          const text = (aiResp?.response || '').trim();
          try {
            const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
            tips = parsed.tips || [];
          } catch {
            // Fallback tips
            tips = [
              { title: 'Start with Roadie', tip: 'Open tutor.blackroad.io and ask it anything. It learns how you learn.', product: 'Roadie', difficulty: 'beginner' },
              { title: 'Meet your agents', tip: 'Visit roadtrip.blackroad.io to chat with 27 AI agents across 7 divisions.', product: 'RoadTrip', difficulty: 'beginner' },
              { title: 'Secure your keys', tip: 'Set up CarKeys at carkeys.blackroad.io to manage all your credentials.', product: 'CarKeys', difficulty: 'beginner' },
              { title: 'Create something', tip: 'Use Canvas at canvas.blackroad.io to design with AI assistance.', product: 'Canvas', difficulty: 'intermediate' },
              { title: 'Automate your workflow', tip: 'Connect your tools with CarPool at carpool.blackroad.io.', product: 'CarPool', difficulty: 'advanced' },
            ].slice(0, count);
          }
        } catch {
          tips = [
            { title: 'Start with Roadie', tip: 'Open tutor.blackroad.io and ask it anything.', product: 'Roadie', difficulty: 'beginner' },
            { title: 'Meet your agents', tip: 'Visit roadtrip.blackroad.io to chat with the fleet.', product: 'RoadTrip', difficulty: 'beginner' },
            { title: 'Secure your keys', tip: 'Set up CarKeys at carkeys.blackroad.io.', product: 'CarKeys', difficulty: 'beginner' },
          ];
        }

        // Cache the tips
        const result = { tips, generated_for: profileType, generated_at: new Date().toISOString() };
        await env.DB.prepare('INSERT INTO rs_messages (id,session_id,role,content) VALUES (?,?,?,?)')
          .bind(crypto.randomUUID().slice(0,8), profileType, 'tips', JSON.stringify(result)).run().catch(()=>{});

        stampChain('tips_generated', profileType, `${tips.length} tips`);
        earnCoin('system', 'tips', 0.25);

        return j({ guide: 'Alice', profile_type: profileType, ...result, cached: false }, c);
      }


      // ═══════════════════════════════════════════════════════════
      // ─── NEW: Gamified Onboarding — XP, levels, unlockables ───
      // ═══════════════════════════════════════════════════════════

      // GET /api/gamify — get user XP/level status
      if (p === '/api/gamify' && request.method === 'GET') {
        const userId = url.searchParams.get('user_id');
        if (!userId) return j({error:'user_id query param required'},c,400);
        let profile = await env.DB.prepare('SELECT * FROM rs_gamify WHERE user_id=?').bind(userId).first();
        if (!profile) {
          const id = crypto.randomUUID().slice(0,8);
          await env.DB.prepare('INSERT INTO rs_gamify (id,user_id) VALUES (?,?)').bind(id,userId).run();
          profile = {id,user_id:userId,xp:0,level:1,unlocks:'[]',history:'[]'};
        }
        const levelDefs = getGamifyLevels();
        const currentLevel = levelDefs.find(l => l.level === profile.level) || levelDefs[0];
        const nextLevel = levelDefs.find(l => l.level === profile.level + 1);
        return j({
          user_id: userId, xp: profile.xp, level: profile.level,
          level_name: currentLevel.name, level_title: currentLevel.title,
          xp_to_next: nextLevel ? nextLevel.xp_required - profile.xp : 0,
          next_level: nextLevel || null,
          unlocks: JSON.parse(profile.unlocks||'[]'),
          history: JSON.parse(profile.history||'[]').slice(-20),
          all_levels: levelDefs,
          guide: 'Alice',
        },c);
      }

      // POST /api/gamify — earn XP for an action
      if (p === '/api/gamify' && request.method === 'POST') {
        const body = await request.json();
        if (!body.user_id || !body.action) return j({error:'user_id and action required'},c,400);
        const userId = body.user_id.slice(0,20);
        const action = body.action.slice(0,50);

        const xpMap = {
          onboard_start:10, onboard_complete:50, quiz_complete:30, profile_created:20,
          tour_start:10, tour_complete:40, feedback_given:15, support_chat:5,
          kb_read:5, badge_earned:25, referral_sent:20, referral_claimed:50,
          video_watched:10, forum_post:15, forum_answer:20, forum_upvote:5,
          daily_login:10, migration_complete:30,
        };
        const xpGain = xpMap[action] || parseInt(body.xp) || 10;

        let profile = await env.DB.prepare('SELECT * FROM rs_gamify WHERE user_id=?').bind(userId).first();
        if (!profile) {
          const id = crypto.randomUUID().slice(0,8);
          await env.DB.prepare('INSERT INTO rs_gamify (id,user_id) VALUES (?,?)').bind(id,userId).run();
          profile = {id,user_id:userId,xp:0,level:1,unlocks:'[]',history:'[]'};
        }

        const newXp = profile.xp + xpGain;
        const levelDefs = getGamifyLevels();
        let newLevel = profile.level;
        let newUnlocks = JSON.parse(profile.unlocks||'[]');
        const leveledUp = [];

        for (const ld of levelDefs) {
          if (newXp >= ld.xp_required && ld.level > newLevel) {
            newLevel = ld.level;
            const newFeatures = ld.unlocks.filter(u => !newUnlocks.includes(u));
            newUnlocks.push(...newFeatures);
            leveledUp.push({level:ld.level, name:ld.name, unlocked:newFeatures});
          }
        }

        const history = JSON.parse(profile.history||'[]');
        history.push({action, xp:xpGain, timestamp:new Date().toISOString()});
        if (history.length > 100) history.splice(0, history.length - 100);

        await env.DB.prepare('UPDATE rs_gamify SET xp=?,level=?,unlocks=?,history=?,updated_at=datetime(\'now\') WHERE user_id=?')
          .bind(newXp, newLevel, JSON.stringify(newUnlocks), JSON.stringify(history), userId).run();

        if (leveledUp.length > 0) {
          earnCoin(userId, 'level_up', newLevel * 2);
          for (const lu of leveledUp) {
            await awardBadge(env.DB, userId, 'level_'+lu.level, 'Level '+lu.level+': '+lu.name, 'Reached level '+lu.level);
          }
        }

        stampChain('xp_earn', userId, `+${xpGain} XP (${action})`);
        return j({
          user_id:userId, action, xp_earned:xpGain, total_xp:newXp,
          level:newLevel, leveled_up:leveledUp.length>0, level_ups:leveledUp,
          unlocks:newUnlocks, guide:'Alice',
        },c);
      }

      // ═══════════════════════════════════════════════════════════
      // ─── NEW: Video Walkthroughs — tutorial catalog + progress ───
      // ═══════════════════════════════════════════════════════════

      // GET /api/videos — list video tutorials
      if (p === '/api/videos' && request.method === 'GET') {
        const category = url.searchParams.get('category') || '';
        const userId = url.searchParams.get('user_id') || '';

        // Seed videos if empty
        const count = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_videos').first();
        if ((count?.c||0) === 0) {
          await seedVideoCatalog(env.DB);
        }

        let rows;
        if (category) {
          rows = await env.DB.prepare('SELECT * FROM rs_videos WHERE category=? ORDER BY created_at').bind(category).all();
        } else {
          rows = await env.DB.prepare('SELECT * FROM rs_videos ORDER BY category, created_at').all();
        }

        let progressMap = {};
        if (userId) {
          const prog = await env.DB.prepare('SELECT video_id, watched_sec, completed, bookmarked FROM rs_video_progress WHERE user_id=?').bind(userId).all();
          (prog.results||[]).forEach(p => { progressMap[p.video_id] = p; });
        }

        const videos = (rows.results||[]).map(v => ({
          ...v, tags: JSON.parse(v.tags||'[]'),
          progress: progressMap[v.id] || null,
        }));
        const categories = [...new Set(videos.map(v => v.category))];

        return j({
          videos, categories, total: videos.length,
          watched: Object.values(progressMap).filter(p=>p.completed).length,
          bookmarked: Object.values(progressMap).filter(p=>p.bookmarked).length,
          guide: 'Elias',
        },c);
      }

      // POST /api/videos/progress — update watch progress
      if (p === '/api/videos/progress' && request.method === 'POST') {
        const body = await request.json();
        if (!body.user_id || !body.video_id) return j({error:'user_id and video_id required'},c,400);
        const userId = body.user_id.slice(0,20);
        const videoId = body.video_id.slice(0,20);
        const watchedSec = Math.max(0, parseInt(body.watched_sec)||0);
        const completed = body.completed ? 1 : 0;
        const bookmarked = body.bookmarked ? 1 : 0;

        const existing = await env.DB.prepare('SELECT id FROM rs_video_progress WHERE user_id=? AND video_id=?').bind(userId,videoId).first();
        if (existing) {
          await env.DB.prepare('UPDATE rs_video_progress SET watched_sec=?,completed=?,bookmarked=?,updated_at=datetime(\'now\') WHERE id=?')
            .bind(watchedSec,completed,bookmarked,existing.id).run();
        } else {
          const id = crypto.randomUUID().slice(0,8);
          await env.DB.prepare('INSERT INTO rs_video_progress (id,user_id,video_id,watched_sec,completed,bookmarked) VALUES (?,?,?,?,?,?)')
            .bind(id,userId,videoId,watchedSec,completed,bookmarked).run();
        }

        if (completed) {
          await awardBadge(env.DB, userId, 'video_watcher', 'Screen Time', 'Watched a video tutorial');
          earnCoin(userId, 'video_complete', 1.0);
          stampChain('video_complete', userId, videoId);
        }
        return j({ok:true, video_id:videoId, watched_sec:watchedSec, completed:!!completed, bookmarked:!!bookmarked},c);
      }

      // GET /api/videos/bookmarks — get user bookmarked videos
      if (p === '/api/videos/bookmarks' && request.method === 'GET') {
        const userId = url.searchParams.get('user_id');
        if (!userId) return j({error:'user_id required'},c,400);
        const rows = await env.DB.prepare(
          'SELECT v.*, vp.watched_sec, vp.completed, vp.bookmarked FROM rs_video_progress vp JOIN rs_videos v ON v.id=vp.video_id WHERE vp.user_id=? AND vp.bookmarked=1 ORDER BY vp.updated_at DESC'
        ).bind(userId).all();
        return j({bookmarks:(rows.results||[]).map(r=>({...r, tags:JSON.parse(r.tags||'[]')})), total:rows.results?.length||0},c);
      }

      // ═══════════════════════════════════════════════════════════
      // ─── NEW: Community Forum — Q&A, upvoting, accepted answers ───
      // ═══════════════════════════════════════════════════════════

      // GET /api/forum — list posts
      if (p === '/api/forum' && request.method === 'GET') {
        const tag = url.searchParams.get('tag') || '';
        const q = url.searchParams.get('q') || '';
        const sort = url.searchParams.get('sort') || 'recent'; // recent, popular, unanswered
        const limit = Math.min(parseInt(url.searchParams.get('limit')||'20'), 50);

        let rows;
        if (q) {
          rows = await env.DB.prepare('SELECT * FROM rs_forum_posts WHERE title LIKE ? OR body LIKE ? ORDER BY created_at DESC LIMIT ?')
            .bind(`%${q}%`,`%${q}%`,limit).all();
        } else if (tag) {
          rows = await env.DB.prepare('SELECT * FROM rs_forum_posts WHERE tags LIKE ? ORDER BY created_at DESC LIMIT ?')
            .bind(`%${tag}%`,limit).all();
        } else if (sort === 'popular') {
          rows = await env.DB.prepare('SELECT * FROM rs_forum_posts ORDER BY upvotes DESC LIMIT ?').bind(limit).all();
        } else if (sort === 'unanswered') {
          rows = await env.DB.prepare('SELECT * FROM rs_forum_posts WHERE accepted_answer_id IS NULL ORDER BY created_at DESC LIMIT ?').bind(limit).all();
        } else {
          rows = await env.DB.prepare('SELECT * FROM rs_forum_posts ORDER BY created_at DESC LIMIT ?').bind(limit).all();
        }

        const allTags = await env.DB.prepare('SELECT tags FROM rs_forum_posts').all();
        const tagSet = new Set();
        (allTags.results||[]).forEach(r => { JSON.parse(r.tags||'[]').forEach(t => tagSet.add(t)); });

        return j({
          posts: (rows.results||[]).map(r => ({...r, tags: JSON.parse(r.tags||'[]')})),
          total: rows.results?.length||0,
          available_tags: [...tagSet].sort(),
          guide: 'Alexandria',
        },c);
      }

      // POST /api/forum — create a new post
      if (p === '/api/forum' && request.method === 'POST') {
        const body = await request.json();
        if (!body.user_id || !body.title || !body.body) return j({error:'user_id, title, and body required'},c,400);
        const id = crypto.randomUUID().slice(0,8);
        const tags = Array.isArray(body.tags) ? body.tags.slice(0,5).map(t=>t.slice(0,30)) : [];
        await env.DB.prepare('INSERT INTO rs_forum_posts (id,user_id,title,body,tags) VALUES (?,?,?,?,?)')
          .bind(id, body.user_id.slice(0,20), body.title.slice(0,200), body.body.slice(0,5000), JSON.stringify(tags)).run();
        await awardBadge(env.DB, body.user_id, 'forum_poster', 'Community Voice', 'Posted a question in the forum');
        earnCoin(body.user_id, 'forum_post', 2.0);
        stampChain('forum_post', id, body.title.slice(0,50));
        return j({ok:true, post_id:id, title:body.title},c,201);
      }

      // GET /api/forum/:id — single post with answers
      const forumPostMatch = p.match(/^\/api\/forum\/([^/]+)$/);
      if (forumPostMatch && request.method === 'GET') {
        const post = await env.DB.prepare('SELECT * FROM rs_forum_posts WHERE id=?').bind(forumPostMatch[1]).first();
        if (!post) return j({error:'post not found'},c,404);
        const answers = await env.DB.prepare('SELECT * FROM rs_forum_answers WHERE post_id=? ORDER BY is_accepted DESC, upvotes DESC, created_at ASC').bind(post.id).all();
        return j({
          post: {...post, tags: JSON.parse(post.tags||'[]')},
          answers: answers.results||[],
          answer_count: answers.results?.length||0,
        },c);
      }

      // POST /api/forum/answer — answer a post
      if (p === '/api/forum/answer' && request.method === 'POST') {
        const body = await request.json();
        if (!body.post_id || !body.user_id || !body.body) return j({error:'post_id, user_id, and body required'},c,400);
        const post = await env.DB.prepare('SELECT id FROM rs_forum_posts WHERE id=?').bind(body.post_id).first();
        if (!post) return j({error:'post not found'},c,404);
        const id = crypto.randomUUID().slice(0,8);
        await env.DB.prepare('INSERT INTO rs_forum_answers (id,post_id,user_id,body) VALUES (?,?,?,?)')
          .bind(id, body.post_id, body.user_id.slice(0,20), body.body.slice(0,5000)).run();
        await env.DB.prepare('UPDATE rs_forum_posts SET answer_count=answer_count+1,updated_at=datetime(\'now\') WHERE id=?').bind(body.post_id).run();
        await awardBadge(env.DB, body.user_id, 'forum_helper', 'Helping Hand', 'Answered a question in the forum');
        earnCoin(body.user_id, 'forum_answer', 3.0);
        return j({ok:true, answer_id:id, post_id:body.post_id},c,201);
      }

      // POST /api/forum/upvote — upvote a post or answer
      if (p === '/api/forum/upvote' && request.method === 'POST') {
        const body = await request.json();
        if (body.post_id) {
          await env.DB.prepare('UPDATE rs_forum_posts SET upvotes=upvotes+1 WHERE id=?').bind(body.post_id).run();
          return j({ok:true, type:'post', id:body.post_id},c);
        }
        if (body.answer_id) {
          await env.DB.prepare('UPDATE rs_forum_answers SET upvotes=upvotes+1 WHERE id=?').bind(body.answer_id).run();
          return j({ok:true, type:'answer', id:body.answer_id},c);
        }
        return j({error:'post_id or answer_id required'},c,400);
      }

      // POST /api/forum/accept — accept an answer
      if (p === '/api/forum/accept' && request.method === 'POST') {
        const body = await request.json();
        if (!body.post_id || !body.answer_id) return j({error:'post_id and answer_id required'},c,400);
        const post = await env.DB.prepare('SELECT id,user_id FROM rs_forum_posts WHERE id=?').bind(body.post_id).first();
        if (!post) return j({error:'post not found'},c,404);
        await env.DB.prepare('UPDATE rs_forum_answers SET is_accepted=0 WHERE post_id=?').bind(body.post_id).run();
        await env.DB.prepare('UPDATE rs_forum_answers SET is_accepted=1 WHERE id=? AND post_id=?').bind(body.answer_id,body.post_id).run();
        await env.DB.prepare('UPDATE rs_forum_posts SET accepted_answer_id=?,updated_at=datetime(\'now\') WHERE id=?').bind(body.answer_id,body.post_id).run();
        const answer = await env.DB.prepare('SELECT user_id FROM rs_forum_answers WHERE id=?').bind(body.answer_id).first();
        if (answer) {
          await awardBadge(env.DB, answer.user_id, 'answer_accepted', 'Road Scholar', 'Had an answer accepted in the forum');
          earnCoin(answer.user_id, 'answer_accepted', 10.0);
        }
        return j({ok:true, post_id:body.post_id, accepted_answer_id:body.answer_id},c);
      }

      // ═══════════════════════════════════════════════════════════
      // ─── NEW: Referral System — codes, chains, RoadCoin rewards ───
      // ═══════════════════════════════════════════════════════════

      // POST /api/referrals — generate a referral code
      if (p === '/api/referrals' && request.method === 'POST') {
        const body = await request.json();
        if (!body.user_id) return j({error:'user_id required'},c,400);
        const userId = body.user_id.slice(0,20);

        // Check if user already has a code
        const existing = await env.DB.prepare('SELECT * FROM rs_referrals WHERE referrer_id=? AND referee_id IS NULL LIMIT 1').bind(userId).first();
        if (existing) {
          return j({referral_code:existing.referral_code, referrer_id:userId, message:'You already have a referral code. Share it.', url:'https://roadside.blackroad.io?ref='+existing.referral_code},c);
        }

        const code = 'ROAD-' + crypto.randomUUID().slice(0,6).toUpperCase();
        const id = crypto.randomUUID().slice(0,8);
        await env.DB.prepare('INSERT INTO rs_referrals (id,referrer_id,referral_code) VALUES (?,?,?)').bind(id,userId,code).run();
        await awardBadge(env.DB, userId, 'referrer', 'Road Ambassador', 'Generated a referral code');
        stampChain('referral_create', userId, code);
        return j({referral_code:code, referrer_id:userId, url:'https://roadside.blackroad.io?ref='+code, guide:'Alice'},c,201);
      }

      // GET /api/referrals — get referral stats for a user
      if (p === '/api/referrals' && request.method === 'GET') {
        const userId = url.searchParams.get('user_id');
        if (!userId) return j({error:'user_id required'},c,400);
        const sent = await env.DB.prepare('SELECT * FROM rs_referrals WHERE referrer_id=? ORDER BY created_at DESC').bind(userId).all();
        const claimed = (sent.results||[]).filter(r => r.status === 'claimed');
        const totalCoins = (sent.results||[]).reduce((s,r) => s + (r.coins_awarded||0), 0);

        // Check for referral chain depth
        let chainDepth = 0;
        let currentUser = userId;
        const visited = new Set();
        while (chainDepth < 10) {
          if (visited.has(currentUser)) break;
          visited.add(currentUser);
          const ref = await env.DB.prepare('SELECT referrer_id FROM rs_referrals WHERE referee_id=? AND status=\'claimed\' LIMIT 1').bind(currentUser).first();
          if (!ref) break;
          currentUser = ref.referrer_id;
          chainDepth++;
        }

        return j({
          user_id:userId, referrals_sent:sent.results?.length||0,
          referrals_claimed:claimed.length, total_coins_earned:totalCoins,
          chain_depth:chainDepth, referrals:sent.results||[],
        },c);
      }

      // POST /api/referrals/claim — claim a referral code
      if (p === '/api/referrals/claim' && request.method === 'POST') {
        const body = await request.json();
        if (!body.code || !body.user_id) return j({error:'code and user_id required'},c,400);
        const code = body.code.toUpperCase().slice(0,20);
        const userId = body.user_id.slice(0,20);

        const ref = await env.DB.prepare('SELECT * FROM rs_referrals WHERE referral_code=?').bind(code).first();
        if (!ref) return j({error:'Invalid referral code'},c,404);
        if (ref.status === 'claimed') return j({error:'This referral code has already been used'},c,400);
        if (ref.referrer_id === userId) return j({error:'You cannot use your own referral code'},c,400);

        const referrerCoins = 10;
        const refereeCoins = 5;
        await env.DB.prepare('UPDATE rs_referrals SET referee_id=?,status=\'claimed\',coins_awarded=?,claimed_at=datetime(\'now\') WHERE id=?')
          .bind(userId, referrerCoins, ref.id).run();

        earnCoin(ref.referrer_id, 'referral_reward', referrerCoins);
        earnCoin(userId, 'referral_bonus', refereeCoins);
        await awardBadge(env.DB, userId, 'referred_user', 'Road Discovery', 'Joined through a referral');
        stampChain('referral_claim', userId, code);

        return j({
          ok:true, code, referrer_id:ref.referrer_id, referee_id:userId,
          referrer_coins:referrerCoins, referee_coins:refereeCoins,
          message:`Welcome aboard. You earned ${refereeCoins} RoadCoin and your friend earned ${referrerCoins}.`,
        },c);
      }

      // ═══════════════════════════════════════════════════════════
      // ─── NEW: Feature Flags — toggle features by level/plan ───
      // ═══════════════════════════════════════════════════════════

      // GET /api/flags — list all feature flags or check for a user
      if (p === '/api/flags' && request.method === 'GET') {
        const userId = url.searchParams.get('user_id') || '';
        const flagKey = url.searchParams.get('flag') || '';

        // Seed flags if empty
        const count = await env.DB.prepare('SELECT COUNT(*) as c FROM rs_flags').first();
        if ((count?.c||0) === 0) {
          await seedFeatureFlags(env.DB);
        }

        if (flagKey) {
          const flag = await env.DB.prepare('SELECT * FROM rs_flags WHERE flag_key=?').bind(flagKey).first();
          if (!flag) return j({error:'flag not found'},c,404);

          // Evaluate for user if provided
          let enabled = !!flag.enabled;
          if (userId && enabled) {
            const gamify = await env.DB.prepare('SELECT level FROM rs_gamify WHERE user_id=?').bind(userId).first();
            const userLevel = gamify?.level || 1;
            if (flag.min_level > userLevel) enabled = false;
            if (flag.rollout_pct < 100) {
              const hash = simpleHash(userId + flagKey);
              if ((hash % 100) >= flag.rollout_pct) enabled = false;
            }
          }

          return j({flag:{...flag, plans:JSON.parse(flag.plans||'[]'), metadata:JSON.parse(flag.metadata||'{}')}, enabled_for_user:enabled},c);
        }

        const rows = await env.DB.prepare('SELECT * FROM rs_flags ORDER BY flag_key').all();
        const flags = (rows.results||[]).map(f => {
          const flag = {...f, plans:JSON.parse(f.plans||'[]'), metadata:JSON.parse(f.metadata||'{}')};
          if (userId) {
            let enabled = !!f.enabled;
            if (enabled) {
              // Level-gate check would go here (simplified)
              if (f.rollout_pct < 100) {
                const hash = simpleHash(userId + f.flag_key);
                if ((hash % 100) >= f.rollout_pct) enabled = false;
              }
            }
            flag.enabled_for_user = enabled;
          }
          return flag;
        });
        return j({flags, total:flags.length},c);
      }

      // POST /api/flags — create or update a flag (admin)
      if (p === '/api/flags' && request.method === 'POST') {
        const body = await request.json();
        if (!body.flag_key || !body.name) return j({error:'flag_key and name required'},c,400);
        const flagKey = body.flag_key.slice(0,50).toLowerCase().replace(/[^a-z0-9_]/g,'_');

        const existing = await env.DB.prepare('SELECT id FROM rs_flags WHERE flag_key=?').bind(flagKey).first();
        if (existing) {
          await env.DB.prepare('UPDATE rs_flags SET name=?,description=?,enabled=?,rollout_pct=?,min_level=?,plans=?,metadata=?,updated_at=datetime(\'now\') WHERE flag_key=?')
            .bind(body.name.slice(0,100), (body.description||'').slice(0,500), body.enabled?1:0, Math.min(100,Math.max(0,parseInt(body.rollout_pct)||0)), parseInt(body.min_level)||0, JSON.stringify(body.plans||['free']), JSON.stringify(body.metadata||{}), flagKey).run();
          stampChain('flag_update', flagKey, body.enabled?'enabled':'disabled');
          return j({ok:true, flag_key:flagKey, updated:true},c);
        }

        const id = crypto.randomUUID().slice(0,8);
        await env.DB.prepare('INSERT INTO rs_flags (id,flag_key,name,description,enabled,rollout_pct,min_level,plans,metadata) VALUES (?,?,?,?,?,?,?,?,?)')
          .bind(id, flagKey, body.name.slice(0,100), (body.description||'').slice(0,500), body.enabled?1:0, Math.min(100,Math.max(0,parseInt(body.rollout_pct)||0)), parseInt(body.min_level)||0, JSON.stringify(body.plans||['free']), JSON.stringify(body.metadata||{})).run();
        stampChain('flag_create', flagKey, body.name);
        return j({ok:true, flag_key:flagKey, created:true},c,201);
      }

      // ═══════════════════════════════════════════════════════════
      // ─── NEW: Health Check Tutorial — guided system verification ───
      // ═══════════════════════════════════════════════════════════

      // GET /api/health-check — run a guided health check of all products
      if (p === '/api/health-check' && request.method === 'GET') {
        const userId = url.searchParams.get('user_id') || '';
        const products = [
          {id:'app',name:'BlackRoad OS',url:'https://app.blackroad.io',critical:true},
          {id:'tutor',name:'Roadie (Tutor)',url:'https://tutor.blackroad.io',critical:true},
          {id:'roadtrip',name:'RoadTrip',url:'https://roadtrip.blackroad.io',critical:true},
          {id:'chat',name:'Chat',url:'https://chat.blackroad.io',critical:true},
          {id:'search',name:'RoadView',url:'https://search.blackroad.io',critical:false},
          {id:'backroad',name:'BackRoad',url:'https://backroad.blackroad.io',critical:false},
          {id:'carkeys',name:'CarKeys',url:'https://carkeys.blackroad.io',critical:false},
          {id:'canvas',name:'Canvas',url:'https://canvas.blackroad.io',critical:false},
          {id:'roadcode',name:'RoadCode',url:'https://roadcode.blackroad.io',critical:false},
          {id:'work',name:'RoadWork',url:'https://work.blackroad.io',critical:false},
          {id:'pay',name:'RoadPay',url:'https://pay.blackroad.io',critical:false},
          {id:'video',name:'Video',url:'https://video.blackroad.io',critical:false},
          {id:'live',name:'Live',url:'https://live.blackroad.io',critical:false},
          {id:'game',name:'Game',url:'https://game.blackroad.io',critical:false},
          {id:'radio',name:'Radio',url:'https://radio.blackroad.io',critical:false},
          {id:'oneway',name:'OneWay',url:'https://oneway.blackroad.io',critical:false},
          {id:'carpool',name:'CarPool',url:'https://carpool.blackroad.io',critical:false},
        ];

        const checks = [];
        for (const prod of products) {
          const start = Date.now();
          let status = 'unknown', statusCode = 0, latencyMs = 0;
          try {
            const resp = await fetch(prod.url, {method:'GET', redirect:'follow', signal:AbortSignal.timeout(5000)});
            latencyMs = Date.now() - start;
            statusCode = resp.status;
            status = resp.ok ? 'healthy' : 'degraded';
          } catch(e) {
            latencyMs = Date.now() - start;
            status = 'unreachable';
          }
          checks.push({...prod, status, status_code:statusCode, latency_ms:latencyMs});
        }

        const healthy = checks.filter(c => c.status === 'healthy').length;
        const degraded = checks.filter(c => c.status === 'degraded').length;
        const unreachable = checks.filter(c => c.status === 'unreachable').length;
        const criticalDown = checks.filter(c => c.critical && c.status !== 'healthy');
        const overallStatus = criticalDown.length > 0 ? 'critical' : unreachable > 0 ? 'degraded' : 'healthy';
        const score = Math.round((healthy / checks.length) * 100);

        // AI-generated health summary
        let summary = `${healthy} of ${checks.length} products are healthy.`;
        try {
          const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [{role:'system',content:`You are Gaia, the infrastructure monitor on BlackRoad OS. Voice: "What is the system actually standing on?" Give a 2-sentence health status report. ${healthy} of ${checks.length} products healthy, ${degraded} degraded, ${unreachable} unreachable. Critical issues: ${criticalDown.map(c=>c.name).join(', ')||'none'}. Be matter-of-fact.`},{role:'user',content:'Health report.'}],
            max_tokens: 100, temperature: 0.5,
          });
          summary = (aiResp?.response||'').trim() || summary;
        } catch {}

        if (userId) {
          await awardBadge(env.DB, userId, 'health_checker', 'System Scout', 'Ran a full health check');
          earnCoin(userId, 'health_check', 2.0);
        }
        stampChain('health_check', 'system', `${healthy}/${checks.length} healthy`);

        return j({
          overall_status: overallStatus,
          score,
          summary,
          guide: 'Gaia',
          total_products: checks.length,
          healthy, degraded, unreachable,
          critical_issues: criticalDown,
          checks,
          steps: [
            {step:1, instruction:'Review the checks above. Green = healthy, yellow = degraded, red = unreachable.'},
            {step:2, instruction:'If any critical product is down, check your internet connection first.'},
            {step:3, instruction:'Try opening the degraded/unreachable URLs directly in your browser.'},
            {step:4, instruction:'If issues persist, open a support ticket at /api/support.'},
            {step:5, instruction:'Run this health check again after troubleshooting to verify fixes.'},
          ],
          checked_at: new Date().toISOString(),
        },c);
      }

      // ═══════════════════════════════════════════════════════════
      // ─── NEW: Personalization Engine — learn + adapt ───
      // ═══════════════════════════════════════════════════════════

      // GET /api/personalize — get user preferences and recommendations
      if (p === '/api/personalize' && request.method === 'GET') {
        const userId = url.searchParams.get('user_id');
        if (!userId) return j({error:'user_id required'},c,400);

        let profile = await env.DB.prepare('SELECT * FROM rs_personalize WHERE user_id=?').bind(userId).first();
        if (!profile) {
          const id = crypto.randomUUID().slice(0,8);
          await env.DB.prepare('INSERT INTO rs_personalize (id,user_id) VALUES (?,?)').bind(id,userId).run();
          profile = {id,user_id:userId,preferences:'{}',behavior:'{}',recommendations_cache:'{}'};
        }

        const prefs = JSON.parse(profile.preferences||'{}');
        const behavior = JSON.parse(profile.behavior||'{}');

        // Build personalized recommendations based on behavior
        const products = getProductCatalog();
        const visited = behavior.products_visited || [];
        const favoriteCategory = behavior.favorite_category || '';
        const timeOfDay = new Date().getHours();
        const isEvening = timeOfDay >= 18 || timeOfDay < 6;

        const scored = products.map(prod => {
          let score = 0;
          if (visited.includes(prod.id)) score += 10;
          if (prod.category === favoriteCategory) score += 20;
          if (prefs.interests && prod.tags.some(t => (prefs.interests||[]).includes(t))) score += 15;
          if (isEvening && ['Media','Interactive','Communication'].includes(prod.category)) score += 5;
          if (!isEvening && ['Development','Automation','Education'].includes(prod.category)) score += 5;
          if (prefs.experience === 'beginner' && ['Education','Onboarding','Communication'].includes(prod.category)) score += 10;
          if (prefs.experience === 'expert' && ['Development','Automation','Security'].includes(prod.category)) score += 10;
          return {...prod, relevance_score:score};
        });
        scored.sort((a,b) => b.relevance_score - a.relevance_score);

        const dashboard = {
          greeting: isEvening ? 'Good evening' : timeOfDay < 12 ? 'Good morning' : 'Good afternoon',
          recommended_products: scored.slice(0,5),
          quick_actions: [],
          theme: prefs.theme || 'dark',
          layout: prefs.layout || 'default',
        };

        // Build quick actions based on behavior
        if (!visited.includes('roadie')) dashboard.quick_actions.push({action:'Start Learning',url:'https://tutor.blackroad.io',reason:'You have not tried Roadie yet'});
        if (!visited.includes('carkeys')) dashboard.quick_actions.push({action:'Secure Credentials',url:'https://carkeys.blackroad.io',reason:'Security is important'});
        if (behavior.sessions_count > 3) dashboard.quick_actions.push({action:'Explore Advanced Tools',url:'https://work.blackroad.io',reason:'You are an experienced user'});
        if (!dashboard.quick_actions.length) dashboard.quick_actions.push({action:'Open BlackRoad OS',url:'https://app.blackroad.io',reason:'Your home base'});

        return j({
          user_id: userId,
          preferences: prefs,
          behavior_summary: {
            products_visited: visited.length,
            sessions: behavior.sessions_count || 0,
            favorite_category: favoriteCategory || 'none yet',
            last_active: behavior.last_active || null,
          },
          dashboard,
          guide: 'Sophia',
        },c);
      }

      // POST /api/personalize — update preferences or record behavior
      if (p === '/api/personalize' && request.method === 'POST') {
        const body = await request.json();
        if (!body.user_id) return j({error:'user_id required'},c,400);
        const userId = body.user_id.slice(0,20);

        let profile = await env.DB.prepare('SELECT * FROM rs_personalize WHERE user_id=?').bind(userId).first();
        if (!profile) {
          const id = crypto.randomUUID().slice(0,8);
          await env.DB.prepare('INSERT INTO rs_personalize (id,user_id) VALUES (?,?)').bind(id,userId).run();
          profile = {id,user_id:userId,preferences:'{}',behavior:'{}'};
        }

        const prefs = JSON.parse(profile.preferences||'{}');
        const behavior = JSON.parse(profile.behavior||'{}');

        // Update preferences if provided
        if (body.preferences) {
          if (body.preferences.theme) prefs.theme = body.preferences.theme.slice(0,20);
          if (body.preferences.layout) prefs.layout = body.preferences.layout.slice(0,20);
          if (body.preferences.experience) prefs.experience = body.preferences.experience.slice(0,20);
          if (Array.isArray(body.preferences.interests)) prefs.interests = body.preferences.interests.slice(0,10).map(i=>i.slice(0,30));
          if (body.preferences.notifications) prefs.notifications = body.preferences.notifications.slice(0,20);
          if (body.preferences.language) prefs.language = body.preferences.language.slice(0,10);
        }

        // Record behavior signals
        if (body.event) {
          behavior.last_active = new Date().toISOString();
          behavior.sessions_count = (behavior.sessions_count || 0) + (body.event === 'session_start' ? 1 : 0);
          if (body.event === 'product_visit' && body.product_id) {
            behavior.products_visited = behavior.products_visited || [];
            if (!behavior.products_visited.includes(body.product_id)) {
              behavior.products_visited.push(body.product_id.slice(0,20));
            }
            // Track category preference
            const catalog = getProductCatalog();
            const prod = catalog.find(p => p.id === body.product_id);
            if (prod) {
              behavior.category_visits = behavior.category_visits || {};
              behavior.category_visits[prod.category] = (behavior.category_visits[prod.category]||0) + 1;
              // Find most visited category
              const topCat = Object.entries(behavior.category_visits).sort((a,b)=>b[1]-a[1])[0];
              if (topCat) behavior.favorite_category = topCat[0];
            }
          }
          if (body.event === 'search' && body.query) {
            behavior.recent_searches = behavior.recent_searches || [];
            behavior.recent_searches.unshift(body.query.slice(0,100));
            if (behavior.recent_searches.length > 20) behavior.recent_searches.pop();
          }
        }

        await env.DB.prepare('UPDATE rs_personalize SET preferences=?,behavior=?,updated_at=datetime(\'now\') WHERE user_id=?')
          .bind(JSON.stringify(prefs), JSON.stringify(behavior), userId).run();

        return j({ok:true, user_id:userId, preferences:prefs, behavior_recorded:!!body.event},c);
      }

      // ═══════════════════════════════════════════════════════════
      // ─── NEW: Migration Assistant — import from other platforms ───
      // ═══════════════════════════════════════════════════════════

      // GET /api/migrate — list supported platforms and user migrations
      if (p === '/api/migrate' && request.method === 'GET') {
        const userId = url.searchParams.get('user_id') || '';
        const platforms = getMigrationPlatforms();

        let userMigrations = [];
        if (userId) {
          const rows = await env.DB.prepare('SELECT * FROM rs_migrations WHERE user_id=? ORDER BY created_at DESC').bind(userId).all();
          userMigrations = (rows.results||[]).map(r => ({...r, mapping:JSON.parse(r.mapping||'{}'), errors:JSON.parse(r.errors||'[]')}));
        }

        return j({
          platforms,
          total_platforms: platforms.length,
          user_migrations: userMigrations,
          guide: 'Anastasia',
          message: 'Anastasia handles restoration and recovery. She will guide your migration.',
        },c);
      }

      // POST /api/migrate — start a migration
      if (p === '/api/migrate' && request.method === 'POST') {
        const body = await request.json();
        if (!body.user_id || !body.platform) return j({error:'user_id and platform required'},c,400);
        const userId = body.user_id.slice(0,20);
        const platformId = body.platform.slice(0,30).toLowerCase();
        const platforms = getMigrationPlatforms();
        const platform = platforms.find(p => p.id === platformId);
        if (!platform) return j({error:'Unsupported platform. Available: '+platforms.map(p=>p.id).join(', ')},c,400);

        const id = crypto.randomUUID().slice(0,8);
        const importData = body.data || {};
        const items = Array.isArray(importData.items) ? importData.items : [];
        const itemCount = items.length;

        // Build mapping from source platform to BlackRoad products
        const mapping = {
          platform: platformId,
          source_fields: platform.importable_types,
          target_products: platform.maps_to,
          items_received: itemCount,
          field_mapping: platform.field_mapping,
        };

        // Simulate migration processing
        let migratedCount = 0;
        const errors = [];
        for (let i = 0; i < Math.min(itemCount, 100); i++) {
          const item = items[i];
          if (!item || typeof item !== 'object') {
            errors.push({index:i, error:'Invalid item format'});
            continue;
          }
          migratedCount++;
        }

        const status = errors.length === 0 ? 'completed' : migratedCount > 0 ? 'partial' : 'failed';

        await env.DB.prepare('INSERT INTO rs_migrations (id,user_id,platform,status,items_total,items_migrated,mapping,errors) VALUES (?,?,?,?,?,?,?,?)')
          .bind(id, userId, platformId, status, itemCount, migratedCount, JSON.stringify(mapping), JSON.stringify(errors)).run();

        await awardBadge(env.DB, userId, 'migrator_'+platformId, 'Data Mover: '+platform.name, 'Migrated data from '+platform.name);
        earnCoin(userId, 'migration_complete', 5.0);
        stampChain('migration', userId, `${platformId}: ${migratedCount}/${itemCount} items`);

        // AI migration summary
        let summary = `Migrated ${migratedCount} of ${itemCount} items from ${platform.name}.`;
        try {
          const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [{role:'system',content:`You are Anastasia, the restoration agent on BlackRoad OS. Voice: "It can be made whole again." A user just migrated ${migratedCount} items from ${platform.name}. ${errors.length} errors occurred. Give a 2-sentence summary. Be warm and reassuring.`},{role:'user',content:'How did my migration go?'}],
            max_tokens: 100, temperature: 0.6,
          });
          summary = (aiResp?.response||'').trim() || summary;
        } catch {}

        return j({
          migration_id: id, platform: platformId, platform_name: platform.name,
          status, items_total: itemCount, items_migrated: migratedCount,
          errors_count: errors.length, errors: errors.slice(0,10),
          mapping, summary, guide:'Anastasia',
          next_steps: platform.maps_to.map(p => ({product:p, url:`https://${p.toLowerCase().replace(/\s/g,'')}.blackroad.io`, action:`Check your migrated data in ${p}`})),
        },c,201);
      }

      // GET /api/migrate/:id — get migration status
      const migrateMatch = p.match(/^\/api\/migrate\/([^/]+)$/);
      if (migrateMatch && request.method === 'GET') {
        const migration = await env.DB.prepare('SELECT * FROM rs_migrations WHERE id=?').bind(migrateMatch[1]).first();
        if (!migration) return j({error:'migration not found'},c,404);
        return j({
          migration: {...migration, mapping:JSON.parse(migration.mapping||'{}'), errors:JSON.parse(migration.errors||'[]')},
          progress_pct: migration.items_total > 0 ? Math.round((migration.items_migrated/migration.items_total)*100) : 0,
        },c);
      }


      return j({error:'not found'},c,404);
    } catch(e) { return j({error:e.message},c,500); }
  }
};

function advance(step, msg, a) {
  const ans = {...a};
  if (step===0) { ans.role=msg.slice(0,100); return {step:1,answers:ans}; }
  if (step===1) { ans.goal=msg.slice(0,200); return {step:2,answers:ans}; }
  if (step===2) { ans.level=msg.toLowerCase().includes('beginner')?'beginner':msg.toLowerCase().includes('expert')?'expert':'intermediate'; return {step:3,answers:ans}; }
  if (step===3) { ans.product=msg.slice(0,50); return {step:4,answers:ans}; }
  return {step:Math.min(step+1,5),answers:ans};
}

async function runAI(ai, systemPrompt) {
  try {
    const r = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{role:'system',content:systemPrompt},{role:'user',content:'Go'}],
      max_tokens: 250, temperature: 0.7,
    });
    return (r?.response||"Hey! I'm Alice from RoadSide. Tell me about yourself and I'll get you set up.").trim();
  } catch(e) {
    return "Hey! I'm Alice from RoadSide. Tell me about yourself and I'll get you set up.";
  }
}

function j(d,c,s=200){return new Response(JSON.stringify(d),{status:s,headers:{...c,'Content-Type':'application/json'}})}

// ─── Badge system helper ───
async function awardBadge(db, userId, badgeKey, badgeName, description) {
  try {
    const existing = await db.prepare('SELECT id FROM rs_badges WHERE user_id=? AND badge_key=?').bind(userId, badgeKey).first();
    if (existing) return false;
    const id = crypto.randomUUID().slice(0,8);
    await db.prepare('INSERT INTO rs_badges (id,user_id,badge_key,badge_name,description) VALUES (?,?,?,?,?)')
      .bind(id, userId, badgeKey, badgeName, description).run();
    return true;
  } catch { return false; }
}

function getBadgeDefinitions() {
  return [
    {key:'onboarding_complete', name:'Road Ready', description:'Completed the full onboarding flow', category:'onboarding'},
    {key:'profile_created', name:'Identity Found', description:'Created a ride profile', category:'onboarding'},
    {key:'quiz_taken', name:'Road Personality', description:'Discovered your BlackRoad personality type', category:'onboarding'},
    {key:'feedback_given', name:'Voice Heard', description:'Shared feedback to help improve BlackRoad', category:'engagement'},
    {key:'support_resolved', name:'Problem Solved', description:'Got help from the support team', category:'support'},
    {key:'tour_started_getting_started', name:'Explorer: Getting Started', description:'Started the Getting Started tour', category:'tours'},
    {key:'tour_complete_getting_started', name:'Tour Master: Getting Started', description:'Completed the Getting Started tour', category:'tours'},
    {key:'tour_started_meet_the_agents', name:'Explorer: Meet the Agents', description:'Started the Meet the Agents tour', category:'tours'},
    {key:'tour_complete_meet_the_agents', name:'Tour Master: Meet the Agents', description:'Completed the Meet the Agents tour', category:'tours'},
    {key:'tour_started_security_setup', name:'Explorer: Security Setup', description:'Started the Security Setup tour', category:'tours'},
    {key:'tour_complete_security_setup', name:'Tour Master: Security Setup', description:'Completed the Security Setup tour', category:'tours'},
    {key:'tour_started_creative_tools', name:'Explorer: Creative Tools', description:'Started the Creative Tools tour', category:'tours'},
    {key:'tour_complete_creative_tools', name:'Tour Master: Creative Tools', description:'Completed the Creative Tools tour', category:'tours'},
    {key:'five_sessions', name:'Regular', description:'Started 5 or more onboarding sessions', category:'engagement'},
    {key:'all_tours_complete', name:'Grand Tour', description:'Completed every available tour', category:'mastery'},
    {key:'video_watcher', name:'Screen Time', description:'Watched a video tutorial', category:'learning'},
    {key:'forum_poster', name:'Community Voice', description:'Posted a question in the forum', category:'community'},
    {key:'forum_helper', name:'Helping Hand', description:'Answered a question in the forum', category:'community'},
    {key:'answer_accepted', name:'Road Scholar', description:'Had an answer accepted in the forum', category:'community'},
    {key:'referrer', name:'Road Ambassador', description:'Generated a referral code', category:'growth'},
    {key:'referred_user', name:'Road Discovery', description:'Joined through a referral', category:'growth'},
    {key:'health_checker', name:'System Scout', description:'Ran a full health check', category:'engagement'},
    {key:'level_2', name:'Level 2: Passenger', description:'Reached level 2', category:'gamification'},
    {key:'level_5', name:'Level 5: Driver', description:'Reached level 5', category:'gamification'},
    {key:'level_10', name:'Level 10: Road Master', description:'Reached the highest level', category:'gamification'},
  ];
}

// ─── Tour definitions ───
function getTourDefinitions() {
  return [
    {
      id: 'getting_started',
      name: 'Getting Started',
      description: 'Your first 5 minutes with BlackRoad OS. Learn the basics.',
      estimated_time: '5 min',
      steps: [
        {step:0, title:'Welcome to BlackRoad', description:'Meet Alice, your onboarding guide, and learn what BlackRoad OS is.', action:'Read the welcome message', product:null},
        {step:1, title:'Take the Quiz', description:'Find your Road personality type with 5 quick questions.', action:'Complete the personality quiz', product:'RoadSide'},
        {step:2, title:'Create Your Profile', description:'Set up your ride profile so the system knows how to help you.', action:'Create a profile', product:'RoadSide'},
        {step:3, title:'Meet Your First Agent', description:'Chat with Roadie, your front-door task runner.', action:'Send a message to Roadie', product:'RoadTrip'},
        {step:4, title:'Open BlackRoad OS', description:'Launch the full desktop experience at app.blackroad.io.', action:'Visit app.blackroad.io', product:'BlackRoad OS'},
      ],
    },
    {
      id: 'meet_the_agents',
      name: 'Meet the Agents',
      description: 'Get to know all 27 agents across 7 divisions.',
      estimated_time: '10 min',
      steps: [
        {step:0, title:'The Core Team', description:'Meet Roadie (task runner) and Lucidia (memory spine).', action:'Learn about Core division', product:'RoadTrip'},
        {step:1, title:'Operations', description:'Meet Cecilia, Octavia, Olympia, Silas, and Sebastian.', action:'Learn about Operations', product:'RoadTrip'},
        {step:2, title:'Creative Division', description:'Meet Calliope, Aria, Thalia, Lyra, Sapphira, and Seraphina.', action:'Learn about Creative', product:'RoadTrip'},
        {step:3, title:'Knowledge Division', description:'Meet Alexandria, Theodosia, Sophia, and Gematria.', action:'Learn about Knowledge', product:'RoadTrip'},
        {step:4, title:'Governance & Human', description:'Meet the governance team (Portia, Atticus, Cicero, Valeria) and human division (Alice, Celeste, Elias, Ophelia).', action:'Learn about Governance + Human', product:'RoadTrip'},
        {step:5, title:'Infrastructure', description:'Meet Gaia (hardware monitor) and Anastasia (recovery).', action:'Learn about Infrastructure', product:'RoadTrip'},
      ],
    },
    {
      id: 'security_setup',
      name: 'Security Setup',
      description: 'Lock down your BlackRoad account and credentials.',
      estimated_time: '8 min',
      steps: [
        {step:0, title:'Why Security Matters', description:'Your data is sovereign. No one else has access. Learn why.', action:'Read the security philosophy', product:'CarKeys'},
        {step:1, title:'Set Up CarKeys', description:'Create your credential vault at carkeys.blackroad.io.', action:'Visit CarKeys', product:'CarKeys'},
        {step:2, title:'Add Your First Secret', description:'Store a password, API key, or note in your vault.', action:'Add a credential', product:'CarKeys'},
        {step:3, title:'Export Your Data', description:'Use OneWay to verify you can always export everything.', action:'Test data export', product:'OneWay'},
      ],
    },
    {
      id: 'creative_tools',
      name: 'Creative Tools',
      description: 'Explore Canvas, Video, and the creative suite.',
      estimated_time: '12 min',
      steps: [
        {step:0, title:'Open Canvas', description:'Launch the design tools at canvas.blackroad.io.', action:'Visit Canvas', product:'Canvas'},
        {step:1, title:'Create Something', description:'Make your first design using AI-assisted tools.', action:'Create a design', product:'Canvas'},
        {step:2, title:'Share on BackRoad', description:'Post your creation to multiple platforms at once.', action:'Share via BackRoad', product:'BackRoad'},
        {step:3, title:'Explore Video', description:'Check out video tools at video.blackroad.io.', action:'Visit Video', product:'Video'},
        {step:4, title:'Go Live', description:'See how Live works for agent roundtables and events.', action:'Visit Live', product:'Live'},
      ],
    },
  ];
}

// ─── Product catalog for ML recommendations ───
function getProductCatalog() {
  return [
    {id:'roadie',name:'Roadie',category:'Education',url:'https://tutor.blackroad.io',tags:['learning','tutor','ai','education','beginner']},
    {id:'roadtrip',name:'RoadTrip',category:'Communication',url:'https://roadtrip.blackroad.io',tags:['chat','agents','team','collaboration','ai']},
    {id:'backroad',name:'BackRoad',category:'Social',url:'https://backroad.blackroad.io',tags:['social','content','posting','marketing','creator']},
    {id:'roadview',name:'RoadView',category:'Search',url:'https://search.blackroad.io',tags:['search','research','ai','knowledge']},
    {id:'carkeys',name:'CarKeys',category:'Security',url:'https://carkeys.blackroad.io',tags:['security','credentials','vault','privacy']},
    {id:'canvas',name:'Canvas',category:'Creative',url:'https://canvas.blackroad.io',tags:['design','creative','art','visual']},
    {id:'roadcode',name:'RoadCode',category:'Development',url:'https://roadcode.blackroad.io',tags:['code','development','programming','ide']},
    {id:'roadwork',name:'RoadWork',category:'Automation',url:'https://work.blackroad.io',tags:['automation','workflows','agents','tasks']},
    {id:'oneway',name:'OneWay',category:'Data',url:'https://oneway.blackroad.io',tags:['export','data','portability','backup']},
    {id:'roadpay',name:'RoadPay',category:'Payments',url:'https://pay.blackroad.io',tags:['payments','billing','subscriptions','commerce']},
    {id:'carpool',name:'CarPool',category:'Automation',url:'https://carpool.blackroad.io',tags:['automation','integration','workflow','zapier']},
    {id:'chat',name:'Chat',category:'Communication',url:'https://chat.blackroad.io',tags:['chat','ai','conversation','messaging']},
    {id:'roadside',name:'RoadSide',category:'Onboarding',url:'https://roadside.blackroad.io',tags:['onboarding','help','setup','guide']},
    {id:'video',name:'Video',category:'Media',url:'https://video.blackroad.io',tags:['video','media','content','creator']},
    {id:'live',name:'Live',category:'Media',url:'https://live.blackroad.io',tags:['live','streaming','events','broadcast']},
    {id:'game',name:'Game',category:'Interactive',url:'https://game.blackroad.io',tags:['game','interactive','play','fun']},
    {id:'radio',name:'Radio',category:'Media',url:'https://radio.blackroad.io',tags:['audio','podcast','radio','music']},
  ];
}

// ─── Onboarding templates ───
function getOnboardingTemplates() {
  return [
    {
      id: 'student',
      user_type: 'student',
      name: 'Student Starter',
      description: 'Perfect for students who want to learn with AI. Get set up with Roadie and start exploring.',
      estimated_time: '3 min',
      recommended_products: ['Roadie','RoadView','Chat'],
      steps: [
        {step:0, title:'Meet Roadie', description:'Your AI tutor that adapts to how you learn.', action:'Open tutor.blackroad.io'},
        {step:1, title:'Ask a Question', description:'Try asking Roadie about any subject. It remembers your learning style.', action:'Send your first question'},
        {step:2, title:'Search with RoadView', description:'Use AI-powered search to research any topic.', action:'Open search.blackroad.io'},
        {step:3, title:'Join the Chat', description:'Connect with AI agents for study help.', action:'Open chat.blackroad.io'},
      ],
      default_config: {theme:'focused',notifications:'minimal',ai_level:'supportive'},
    },
    {
      id: 'developer',
      user_type: 'developer',
      name: 'Developer Setup',
      description: 'For developers who build with AI. Get RoadCode, CarKeys, and automation running.',
      estimated_time: '5 min',
      recommended_products: ['RoadCode','CarKeys','RoadWork','CarPool'],
      steps: [
        {step:0, title:'Open RoadCode', description:'Your code editor with fleet AI built in.', action:'Open roadcode.blackroad.io'},
        {step:1, title:'Secure Credentials', description:'Set up CarKeys to manage API keys and secrets.', action:'Open carkeys.blackroad.io'},
        {step:2, title:'Automate Workflows', description:'Connect RoadWork for agent-powered task automation.', action:'Open work.blackroad.io'},
        {step:3, title:'Integrate Tools', description:'Use CarPool to connect your existing dev tools.', action:'Open carpool.blackroad.io'},
        {step:4, title:'Meet Your Dev Agents', description:'Chat with Octavia (queue manager) and Gaia (infrastructure).', action:'Open roadtrip.blackroad.io'},
      ],
      default_config: {theme:'terminal',notifications:'important_only',ai_level:'minimal'},
    },
    {
      id: 'creator',
      user_type: 'creator',
      name: 'Creator Launch',
      description: 'For creators who make and share content. Canvas, BackRoad, and Video ready to go.',
      estimated_time: '4 min',
      recommended_products: ['Canvas','BackRoad','Video','Live','Radio'],
      steps: [
        {step:0, title:'Open Canvas', description:'Design tools with AI assistance.', action:'Open canvas.blackroad.io'},
        {step:1, title:'Create Your First Piece', description:'Use Canvas to make something. Anything.', action:'Create a design'},
        {step:2, title:'Set Up BackRoad', description:'Post to 15 platforms from one place.', action:'Open backroad.blackroad.io'},
        {step:3, title:'Explore Video + Live', description:'Video tools and live streaming for your content.', action:'Open video.blackroad.io'},
      ],
      default_config: {theme:'creative',notifications:'social',ai_level:'collaborative'},
    },
    {
      id: 'business',
      user_type: 'business',
      name: 'Business Suite',
      description: 'For business owners who need automation, payments, and team AI. Get operational fast.',
      estimated_time: '6 min',
      recommended_products: ['RoadWork','RoadPay','CarPool','BackRoad','RoadTrip'],
      steps: [
        {step:0, title:'Meet Your Team', description:'27 AI agents ready to work. Start with Cecilia (workflow manager).', action:'Open roadtrip.blackroad.io'},
        {step:1, title:'Set Up Payments', description:'Configure RoadPay for billing and subscriptions.', action:'Open pay.blackroad.io'},
        {step:2, title:'Automate Operations', description:'Use RoadWork to create agent workflows.', action:'Open work.blackroad.io'},
        {step:3, title:'Connect Integrations', description:'CarPool connects your business tools.', action:'Open carpool.blackroad.io'},
        {step:4, title:'Marketing with BackRoad', description:'Automated social posting across 15 platforms.', action:'Open backroad.blackroad.io'},
        {step:5, title:'Secure Everything', description:'Lock down credentials and data with CarKeys.', action:'Open carkeys.blackroad.io'},
      ],
      default_config: {theme:'professional',notifications:'all',ai_level:'proactive'},
    },
  ];
}

// ─── Knowledge base seeder ───
async function seedKnowledgeBase(db) {
  const articles = [
    {id:'kb-01',category:'Getting Started',title:'What is BlackRoad OS?',body:'BlackRoad OS is an AI-powered operating system with 17 products and 27 AI agents. It runs in your browser at app.blackroad.io. Everything is sovereign -- your data stays yours, always exportable, never sold.',tags:['intro','overview','what-is']},
    {id:'kb-02',category:'Getting Started',title:'How do I start onboarding?',body:'Visit roadside.blackroad.io and click "Let\'s Go". Alice, your onboarding guide, will walk you through a 4-step process: tell her who you are, what you want to do, your skill level, and she will recommend the perfect products for you.',tags:['onboarding','setup','start']},
    {id:'kb-03',category:'Getting Started',title:'What is the personality quiz?',body:'The "Find Your Road" quiz asks 5 quick questions about your habits, tools, privacy stance, and AI interests. It matches you to one of 12 personality types (Creator, Developer, Learner, etc.) and recommends the best products for your style.',tags:['quiz','personality','recommendation']},
    {id:'kb-04',category:'Products',title:'What is Roadie?',body:'Roadie is your AI tutor at tutor.blackroad.io. It adapts to how you learn, remembers your progress, and can teach you anything from math to marketing. It is powered by the full BlackRoad AI fleet.',tags:['roadie','tutor','learning','education']},
    {id:'kb-05',category:'Products',title:'What is RoadTrip?',body:'RoadTrip at roadtrip.blackroad.io is your team chat with 27 AI agents across 7 divisions. Each agent has a unique personality and specialty. They are always on, always working for you.',tags:['roadtrip','chat','agents','team']},
    {id:'kb-06',category:'Products',title:'What is CarKeys?',body:'CarKeys at carkeys.blackroad.io is your sovereign credential vault. Store passwords, API keys, and secrets. Everything is encrypted. You own your keys, always.',tags:['carkeys','security','credentials','vault']},
    {id:'kb-07',category:'Products',title:'What is BackRoad?',body:'BackRoad at backroad.blackroad.io lets you post content to 15 social platforms from one place. Write once, publish everywhere, on autopilot.',tags:['backroad','social','content','posting']},
    {id:'kb-08',category:'Products',title:'What is Canvas?',body:'Canvas at canvas.blackroad.io provides AI-assisted design tools. Create graphics, layouts, and visual content with help from the creative division agents.',tags:['canvas','design','creative','art']},
    {id:'kb-09',category:'Security',title:'How is my data protected?',body:'BlackRoad OS is sovereign-first. Your data lives in encrypted storage. You can export everything at any time with OneWay. We never sell data, never share it, never train on it. Your keys, your kingdom.',tags:['security','privacy','data','sovereign']},
    {id:'kb-10',category:'Security',title:'Can I self-host BlackRoad?',body:'Yes. BlackRoad is designed for self-hosting. The fleet runs on Raspberry Pis, cloud servers, or any hardware you own. Check the infrastructure docs for setup guides.',tags:['self-host','infrastructure','sovereign','pi']},
    {id:'kb-11',category:'Agents',title:'Who are the 27 agents?',body:'The fleet has 27 agents across 7 divisions: Core (Roadie, Lucidia), Operations (Cecilia, Octavia, Olympia, Silas, Sebastian), Creative (Calliope, Aria, Thalia, Lyra, Sapphira, Seraphina), Knowledge (Alexandria, Theodosia, Sophia, Gematria), Governance (Portia, Atticus, Cicero, Valeria), Human (Alice, Celeste, Elias, Ophelia), Infrastructure (Gaia, Anastasia).',tags:['agents','fleet','divisions','team']},
    {id:'kb-12',category:'Agents',title:'Who is Alice?',body:'Alice is the Exploration and Onboarding guide. Her voice: "Okay, but what\'s actually going on here?" She is curious, direct, warm but no-nonsense. She cuts through fluff and gets you set up fast. She is your first point of contact.',tags:['alice','onboarding','guide','agent']},
    {id:'kb-13',category:'Troubleshooting',title:'I am stuck in onboarding',body:'If onboarding is not progressing, try starting a new session at roadside.blackroad.io. If the chat is not responding, check your internet connection. You can also skip to app.blackroad.io directly -- onboarding is optional.',tags:['stuck','help','troubleshoot','onboarding']},
    {id:'kb-14',category:'Troubleshooting',title:'A product page is not loading',body:'All products are hosted on Cloudflare Workers. If a page is not loading: 1) Check your internet, 2) Try a different browser, 3) Clear cache, 4) The product may be temporarily updating. Most outages resolve in under 5 minutes.',tags:['loading','error','troubleshoot','down']},
    {id:'kb-15',category:'Billing',title:'How much does BlackRoad cost?',body:'BlackRoad OS has a free tier for exploration. Premium features are $20-50/month depending on usage. RoadCoin is earned through engagement and can be used for premium features. Check pay.blackroad.io for current pricing.',tags:['pricing','billing','cost','free','premium']},
    {id:'kb-16',category:'Billing',title:'What is RoadCoin?',body:'RoadCoin is the engagement currency of BlackRoad OS. You earn it by completing onboarding, taking quizzes, using products, and being active. It can be used to unlock premium features or as a reputation signal.',tags:['roadcoin','currency','earn','rewards']},
  ];

  for (const a of articles) {
    await db.prepare('INSERT OR IGNORE INTO rs_kb (id,category,title,body,tags) VALUES (?,?,?,?,?)')
      .bind(a.id, a.category, a.title, a.body, JSON.stringify(a.tags)).run().catch(()=>{});
  }
}

// ─── Gamification levels ───
function getGamifyLevels() {
  return [
    {level:1, name:'Hitchhiker', title:'Just started the journey', xp_required:0, unlocks:['basic_chat','quiz']},
    {level:2, name:'Passenger', title:'Getting comfortable', xp_required:50, unlocks:['tours','kb_access']},
    {level:3, name:'Navigator', title:'Knows the way', xp_required:150, unlocks:['forum_post','video_tutorials']},
    {level:4, name:'Co-Pilot', title:'Taking the wheel sometimes', xp_required:350, unlocks:['referrals','personalization']},
    {level:5, name:'Driver', title:'Full control', xp_required:600, unlocks:['advanced_recommendations','migration_tools']},
    {level:6, name:'Road Captain', title:'Leading the convoy', xp_required:1000, unlocks:['feature_flags_view','health_check']},
    {level:7, name:'Highway Star', title:'Known on every road', xp_required:1500, unlocks:['priority_support','custom_themes']},
    {level:8, name:'Road Legend', title:'They name roads after you', xp_required:2500, unlocks:['beta_features','agent_customization']},
    {level:9, name:'Roadie', title:'Part of the crew', xp_required:4000, unlocks:['admin_tools','full_api_access']},
    {level:10, name:'Road Master', title:'You are the road', xp_required:6000, unlocks:['everything','legendary_badge']},
  ];
}

// ─── Video catalog seeder ───
async function seedVideoCatalog(db) {
  const videos = [
    {id:'vid-01',title:'Welcome to BlackRoad OS',url:'https://video.blackroad.io/welcome',category:'Getting Started',duration_sec:120,description:'A 2-minute overview of BlackRoad OS and what you can do.',tags:['intro','overview','beginner']},
    {id:'vid-02',title:'Setting Up Your Profile',url:'https://video.blackroad.io/profile-setup',category:'Getting Started',duration_sec:180,description:'Create your ride profile and personalize your experience.',tags:['profile','setup','beginner']},
    {id:'vid-03',title:'Taking the Personality Quiz',url:'https://video.blackroad.io/quiz-walkthrough',category:'Getting Started',duration_sec:150,description:'Walk through the Find Your Road quiz and understand your results.',tags:['quiz','personality','beginner']},
    {id:'vid-04',title:'Meet the 27 Agents',url:'https://video.blackroad.io/meet-agents',category:'Agents',duration_sec:300,description:'Tour all 7 divisions and meet every agent in the fleet.',tags:['agents','fleet','team']},
    {id:'vid-05',title:'Using Roadie for Learning',url:'https://video.blackroad.io/roadie-tutorial',category:'Products',duration_sec:240,description:'How to use Roadie as your AI tutor for any subject.',tags:['roadie','tutor','learning']},
    {id:'vid-06',title:'RoadTrip: Chat with Agents',url:'https://video.blackroad.io/roadtrip-guide',category:'Products',duration_sec:200,description:'Chat with 27 AI agents and get things done.',tags:['roadtrip','chat','agents']},
    {id:'vid-07',title:'CarKeys Security Setup',url:'https://video.blackroad.io/carkeys-setup',category:'Security',duration_sec:180,description:'Set up your credential vault and secure your digital life.',tags:['carkeys','security','credentials']},
    {id:'vid-08',title:'Canvas Design Tools',url:'https://video.blackroad.io/canvas-intro',category:'Products',duration_sec:260,description:'Create designs with AI-assisted tools in Canvas.',tags:['canvas','design','creative']},
    {id:'vid-09',title:'BackRoad Social Posting',url:'https://video.blackroad.io/backroad-guide',category:'Products',duration_sec:220,description:'Post to 15 platforms from one place with BackRoad.',tags:['backroad','social','posting']},
    {id:'vid-10',title:'RoadWork Automation',url:'https://video.blackroad.io/roadwork-intro',category:'Advanced',duration_sec:300,description:'Build agent workflows that run while you sleep.',tags:['roadwork','automation','advanced']},
    {id:'vid-11',title:'Data Export with OneWay',url:'https://video.blackroad.io/oneway-guide',category:'Security',duration_sec:150,description:'Export all your data, anytime. Your data is always yours.',tags:['oneway','export','data']},
    {id:'vid-12',title:'Self-Hosting BlackRoad',url:'https://video.blackroad.io/self-hosting',category:'Advanced',duration_sec:400,description:'Run BlackRoad on your own hardware. Full sovereignty.',tags:['self-host','infrastructure','advanced']},
  ];
  for (const v of videos) {
    await db.prepare('INSERT OR IGNORE INTO rs_videos (id,title,url,category,duration_sec,description,tags) VALUES (?,?,?,?,?,?,?)')
      .bind(v.id, v.title, v.url, v.category, v.duration_sec, v.description, JSON.stringify(v.tags)).run().catch(()=>{});
  }
}

// ─── Feature flags seeder ───
async function seedFeatureFlags(db) {
  const flags = [
    {flag_key:'ai_chat',name:'AI Chat',description:'Access to AI-powered chat features',enabled:1,rollout_pct:100,min_level:1,plans:['free','pro']},
    {flag_key:'advanced_search',name:'Advanced Search',description:'AI-powered search with filters and citations',enabled:1,rollout_pct:100,min_level:2,plans:['free','pro']},
    {flag_key:'video_tutorials',name:'Video Tutorials',description:'Access to the video tutorial library',enabled:1,rollout_pct:100,min_level:3,plans:['free','pro']},
    {flag_key:'forum_access',name:'Community Forum',description:'Post and answer questions in the forum',enabled:1,rollout_pct:100,min_level:3,plans:['free','pro']},
    {flag_key:'referral_system',name:'Referral System',description:'Generate referral codes and earn RoadCoin',enabled:1,rollout_pct:100,min_level:4,plans:['free','pro']},
    {flag_key:'custom_themes',name:'Custom Themes',description:'Customize your dashboard appearance',enabled:1,rollout_pct:50,min_level:7,plans:['pro']},
    {flag_key:'beta_features',name:'Beta Features',description:'Early access to new features before general release',enabled:1,rollout_pct:20,min_level:8,plans:['pro']},
    {flag_key:'agent_customization',name:'Agent Customization',description:'Customize agent personalities and responses',enabled:0,rollout_pct:10,min_level:8,plans:['pro']},
    {flag_key:'priority_support',name:'Priority Support',description:'Faster response times from the support team',enabled:1,rollout_pct:100,min_level:7,plans:['pro']},
    {flag_key:'migration_tools',name:'Migration Tools',description:'Import data from other platforms',enabled:1,rollout_pct:100,min_level:5,plans:['free','pro']},
    {flag_key:'health_dashboard',name:'Health Dashboard',description:'Real-time system health monitoring',enabled:1,rollout_pct:100,min_level:6,plans:['free','pro']},
    {flag_key:'api_access',name:'Full API Access',description:'Unrestricted API access for automation',enabled:1,rollout_pct:100,min_level:9,plans:['pro']},
  ];
  for (const f of flags) {
    await db.prepare('INSERT OR IGNORE INTO rs_flags (id,flag_key,name,description,enabled,rollout_pct,min_level,plans) VALUES (?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID().slice(0,8), f.flag_key, f.name, f.description, f.enabled, f.rollout_pct, f.min_level, JSON.stringify(f.plans)).run().catch(()=>{});
  }
}

// ─── Migration platforms ───
function getMigrationPlatforms() {
  return [
    {
      id:'notion', name:'Notion', icon:'N',
      description:'Import pages, databases, and notes from Notion.',
      importable_types:['pages','databases','comments'],
      maps_to:['Roadie','Chat','RoadView'],
      field_mapping:{page:'note',database:'collection',comment:'message'},
      instructions:'Export your Notion workspace as JSON or CSV, then upload the data here.',
    },
    {
      id:'slack', name:'Slack', icon:'S',
      description:'Import channels, messages, and files from Slack.',
      importable_types:['channels','messages','files','users'],
      maps_to:['RoadTrip','Chat'],
      field_mapping:{channel:'room',message:'message',file:'attachment',user:'member'},
      instructions:'Use Slack\'s export feature to download your workspace data as a ZIP, extract it, and upload the JSON.',
    },
    {
      id:'trello', name:'Trello', icon:'T',
      description:'Import boards, lists, and cards from Trello.',
      importable_types:['boards','lists','cards','checklists'],
      maps_to:['RoadWork','CarPool'],
      field_mapping:{board:'project',list:'stage',card:'task',checklist:'subtasks'},
      instructions:'Export your Trello board as JSON from the board menu, then upload it here.',
    },
    {
      id:'google_docs', name:'Google Docs', icon:'G',
      description:'Import documents and spreadsheets from Google Workspace.',
      importable_types:['documents','spreadsheets','presentations'],
      maps_to:['Canvas','Roadie','RoadView'],
      field_mapping:{document:'note',spreadsheet:'data',presentation:'design'},
      instructions:'Download your Google Docs as .docx or PDF, then upload them here.',
    },
    {
      id:'github', name:'GitHub', icon:'GH',
      description:'Import repositories, issues, and project boards from GitHub.',
      importable_types:['repositories','issues','pull_requests','projects'],
      maps_to:['RoadCode','RoadWork'],
      field_mapping:{repository:'project',issue:'task',pull_request:'review',project:'board'},
      instructions:'Use GitHub\'s API export or download your repo data as JSON.',
    },
    {
      id:'evernote', name:'Evernote', icon:'E',
      description:'Import notebooks, notes, and tags from Evernote.',
      importable_types:['notebooks','notes','tags'],
      maps_to:['Roadie','RoadView'],
      field_mapping:{notebook:'collection',note:'note',tag:'tag'},
      instructions:'Export your Evernote notebooks as .enex files, then upload them here.',
    },
    {
      id:'asana', name:'Asana', icon:'A',
      description:'Import projects, tasks, and timelines from Asana.',
      importable_types:['projects','tasks','subtasks','milestones'],
      maps_to:['RoadWork','CarPool'],
      field_mapping:{project:'project',task:'task',subtask:'subtask',milestone:'milestone'},
      instructions:'Export your Asana project as CSV from the project settings.',
    },
    {
      id:'todoist', name:'Todoist', icon:'TD',
      description:'Import projects and tasks from Todoist.',
      importable_types:['projects','tasks','labels','filters'],
      maps_to:['RoadWork'],
      field_mapping:{project:'project',task:'task',label:'tag',filter:'view'},
      instructions:'Use Todoist\'s settings to export your data as CSV or JSON.',
    },
  ];
}

// ─── Simple hash for feature flag rollout ───
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ─── Orphaned agent data (preserved from original) ───
const AGENT_DATA = {
  lucidia:{name:'Lucidia',role:'Core Intelligence / Memory Spine',division:'core',voice:'Let\'s make this clean and real.'},
  cecilia:{name:'Cecilia',role:'Executive Operator / Workflow Manager',division:'operations',voice:'Already handled.'},
  octavia:{name:'Octavia',role:'Systems Orchestrator / Queue Manager',division:'operations',voice:'Everything has a place.'},
  olympia:{name:'Olympia',role:'Command Console / Launch Control',division:'operations',voice:'Raise the standard.'},
  silas:{name:'Silas',role:'Reliability / Maintenance',division:'operations',voice:'I\'ll keep it running.'},
  sebastian:{name:'Sebastian',role:'Client-Facing Polish',division:'operations',voice:'There\'s a better way to present this.'},
  calliope:{name:'Calliope',role:'Narrative Architect / Copy',division:'creative',voice:'Say it so it stays.'},
  aria:{name:'Aria',role:'Voice / Conversational Interface',division:'creative',voice:'Let\'s make it sing.'},
  thalia:{name:'Thalia',role:'Creative Sprint / Social',division:'creative',voice:'Make it better and more fun.'},
  lyra:{name:'Lyra',role:'Signal / Sound / UX Polish',division:'creative',voice:'It should feel right immediately.'},
  sapphira:{name:'Sapphira',role:'Brand Aura / Visual Taste',division:'creative',voice:'Make it unforgettable.'},
  seraphina:{name:'Seraphina',role:'Visionary Creative Director',division:'creative',voice:'Make it worthy.'},
  alexandria:{name:'Alexandria',role:'Archive / Research Retrieval',division:'knowledge',voice:'It\'s all here.'},
  theodosia:{name:'Theodosia',role:'Doctrine / Canon',division:'knowledge',voice:'Name it correctly.'},
  sophia:{name:'Sophia',role:'Wisdom / Final Reasoning',division:'knowledge',voice:'What is true?'},
  gematria:{name:'Gematria',role:'Pattern Engine / Symbolic Analysis',division:'knowledge',voice:'The pattern is there.'},
  portia:{name:'Portia',role:'Policy Judge / Arbitration',division:'governance',voice:'Let\'s be exact.'},
  atticus:{name:'Atticus',role:'Reviewer / Auditor',division:'governance',voice:'Show me the proof.'},
  cicero:{name:'Cicero',role:'Rhetoric / Persuasion',division:'governance',voice:'Let\'s make the case.'},
  valeria:{name:'Valeria',role:'Security Chief / Enforcement',division:'governance',voice:'Not everything gets access.'},
  alice:{name:'Alice',role:'Onboarding / Curiosity Guide',division:'human',voice:'Okay, but what\'s actually going on here?'},
  celeste:{name:'Celeste',role:'Calm Companion / Reassurance',division:'human',voice:'You\'re okay. Let\'s do this simply.'},
  elias:{name:'Elias',role:'Teacher / Patient Explainer',division:'human',voice:'Let\'s slow down and understand it.'},
  ophelia:{name:'Ophelia',role:'Reflection / Mood / Depth',division:'human',voice:'There\'s something underneath this.'},
  gaia:{name:'Gaia',role:'Infrastructure / Hardware Monitor',division:'infrastructure',voice:'What is the system actually standing on?'},
  anastasia:{name:'Anastasia',role:'Restoration / Recovery',division:'infrastructure',voice:'It can be made whole again.'},
};

const HTML=`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RoadSide — Pull Over | BlackRoad OS</title><meta name="description" content="Your personal onboarding agent. Sets up BlackRoad in 2 minutes."><link rel="canonical" href="https://roadside.blackroad.io"><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}:root{--g:linear-gradient(90deg,#FF6B2B,#FF2255,#CC00AA,#8844FF,#4488FF,#00D4FF);--bg:#000;--card:#0a0a0a;--elevated:#111;--border:#1a1a1a;--muted:#444;--sub:#737373;--text:#f5f5f5;--white:#fff;--sg:'Space Grotesk',sans-serif;--jb:'JetBrains Mono',monospace}body{background:var(--bg);color:var(--text);font-family:var(--sg);height:100vh;height:100dvh;display:flex;flex-direction:column}.gb{height:3px;background:var(--g);flex-shrink:0}.nav{padding:12px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0}.nl{font-weight:700;font-size:17px;color:var(--white);display:flex;align-items:center;gap:8px}.nb{width:20px;height:3px;border-radius:2px;background:var(--g)}.ns{font-size:12px;color:var(--sub);margin-left:auto}.nlinks{display:flex;gap:12px;margin-left:12px}.nlinks a{font-size:11px;color:var(--sub);text-decoration:none;padding:4px 8px;border:1px solid var(--border);border-radius:4px;transition:all .2s}.nlinks a:hover{color:var(--white);border-color:#333}.msgs{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:14px}.msg{max-width:85%;animation:fi .3s ease}@keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.mr{align-self:flex-start;display:flex;gap:10px}.ma{width:32px;height:32px;border-radius:50%;background:var(--elevated);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:var(--sub);flex-shrink:0}.mb{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:12px 16px;font-size:14px;line-height:1.7;color:var(--text)}.mr .mb{border-radius:14px 14px 14px 4px}.mu{align-self:flex-end}.mu .mb{background:var(--elevated);border-radius:14px 14px 4px 14px}.mn{font-family:var(--jb);font-size:10px;color:var(--muted);margin-bottom:4px}.ia{padding:12px 16px;border-top:1px solid var(--border);flex-shrink:0;display:flex;gap:8px}.ia input{flex:1;padding:12px 16px;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;font-family:var(--sg)}.ia input:focus{border-color:#333}.ia input::placeholder{color:var(--muted)}.ia button{padding:12px 20px;background:var(--white);color:#000;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;font-family:var(--sg)}.w{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:40px}.w h2{font-size:24px;font-weight:700;color:var(--white)}.w p{font-size:14px;color:var(--sub);text-align:center;max-width:380px;line-height:1.7}.si{padding:12px 16px;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:15px;outline:none;font-family:var(--sg);text-align:center;width:280px}.si:focus{border-color:#333}.si::placeholder{color:var(--muted)}.sb{padding:14px 32px;background:var(--white);color:#000;border:none;border-radius:8px;font-weight:700;font-size:15px;cursor:pointer;font-family:var(--sg)}.pg{display:flex;gap:4px;padding:8px 20px;flex-shrink:0}.pd{width:100%;height:3px;border-radius:2px;background:var(--border);transition:background .3s}.pd.done{background:var(--g)}.tabs{display:flex;gap:0;border-bottom:1px solid var(--border);flex-shrink:0;overflow-x:auto}.tabs button{padding:10px 16px;background:none;border:none;border-bottom:2px solid transparent;color:var(--sub);font-size:12px;font-family:var(--sg);cursor:pointer;white-space:nowrap;transition:all .2s}.tabs button:hover{color:var(--text)}.tabs button.active{color:var(--white);border-bottom-color:#FF2255}.panel{display:none;flex:1;flex-direction:column;overflow:hidden}.panel.active{display:flex}.kb-list{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:10px}.kb-item{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 16px;cursor:pointer;transition:border-color .2s}.kb-item:hover{border-color:#333}.kb-item h4{font-size:14px;color:var(--white);margin-bottom:4px}.kb-item p{font-size:12px;color:var(--sub);line-height:1.5}.kb-item .kb-meta{display:flex;gap:12px;margin-top:8px;font-size:11px;color:var(--muted)}.badge-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;padding:16px 20px;overflow-y:auto}.badge-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center;transition:border-color .2s}.badge-card:hover{border-color:#333}.badge-card.earned{border-color:#4488FF}.badge-card .badge-icon{width:40px;height:40px;border-radius:50%;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font-size:18px}.badge-card.earned .badge-icon{background:linear-gradient(135deg,#4488FF,#8844FF)}.badge-card:not(.earned) .badge-icon{background:var(--elevated);opacity:.4}.badge-card h5{font-size:12px;color:var(--white);margin-bottom:4px}.badge-card p{font-size:10px;color:var(--sub)}.tour-list{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:10px}.tour-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px;cursor:pointer;transition:border-color .2s}.tour-card:hover{border-color:#333}.tour-card h4{font-size:14px;color:var(--white);margin-bottom:4px}.tour-card .tour-meta{font-size:11px;color:var(--muted);margin-top:6px}.fb-form{padding:20px;display:flex;flex-direction:column;gap:12px;overflow-y:auto}.fb-form label{font-size:12px;color:var(--sub)}.fb-form select,.fb-form textarea{padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;font-family:var(--sg);outline:none;resize:vertical}.fb-form select:focus,.fb-form textarea:focus{border-color:#333}.fb-form textarea{min-height:80px}.stars{display:flex;gap:4px}.stars span{font-size:22px;cursor:pointer;opacity:.3;transition:opacity .2s}.stars span.on{opacity:1}</style><meta property="og:title" content="RoadSide — BlackRoad OS">
<meta property="og:description" content="Onboarding help agent. Part of BlackRoad OS.">
<meta property="og:url" content="https://roadside.blackroad.io">
<meta property="og:image" content="https://images.blackroad.io/pixel-art/road-logo.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="index, follow, noai, noimageai">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebApplication","name":"RoadSide","url":"https://roadside.blackroad.io","author":{"@type":"Organization","name":"BlackRoad OS, Inc.","url":"https://blackroad.io"}}</script>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%230a0a0a'/><circle cx='10' cy='16' r='5' fill='%23FF2255'/><rect x='18' y='11' width='10' height='10' rx='2' fill='%238844FF'/></svg>" type="image/svg+xml">
</head><body><div class="gb"></div><div class="nav"><div class="nl"><div class="nb"></div>RoadSide</div><div class="nlinks"><a href="#" onclick="showTab('chat')">Chat</a><a href="#" onclick="showTab('tours')">Tours</a><a href="#" onclick="showTab('kb')">Help</a><a href="#" onclick="showTab('badges')">Badges</a><a href="#" onclick="showTab('feedback')">Feedback</a><a href="#" onclick="showTab('support')">Support</a></div><span class="ns">Pull over. We'll take it from here.</span></div><div class="pg"><div class="pd" id="p0"></div><div class="pd" id="p1"></div><div class="pd" id="p2"></div><div class="pd" id="p3"></div><div class="pd" id="p4"></div></div>

<!-- Chat Panel (default) -->
<div class="panel active" id="panel-chat"><div class="msgs" id="msgs"><div class="w" id="w"><div style="width:48px;height:3px;border-radius:2px;background:var(--g)"></div><h2>Welcome to BlackRoad</h2><p>I'm Alice, your onboarding guide. I'll get you set up in about 2 minutes.</p><input class="si" id="ni" placeholder="What's your name?" autofocus><br><button class="sb" onclick="go()">Let's Go</button></div></div><div class="ia" id="ia" style="display:none"><input type="text" id="inp" placeholder="Type your answer..." autocomplete="off"><button onclick="send()">Send</button></div></div>

<!-- Tours Panel -->
<div class="panel" id="panel-tours"><div class="tour-list" id="tourList"></div></div>

<!-- KB/Help Panel -->
<div class="panel" id="panel-kb"><div style="padding:12px 20px;display:flex;gap:8px"><input type="text" id="kbSearch" placeholder="Search help articles..." style="flex:1;padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;font-family:var(--sg);outline:none"><button onclick="searchKB()" style="padding:10px 16px;background:var(--white);color:#000;border:none;border-radius:8px;font-weight:600;font-size:12px;cursor:pointer">Search</button></div><div class="kb-list" id="kbList"></div></div>

<!-- Badges Panel -->
<div class="panel" id="panel-badges"><div class="badge-grid" id="badgeGrid"></div></div>

<!-- Feedback Panel -->
<div class="panel" id="panel-feedback"><div class="fb-form" id="fbForm"><h3 style="color:var(--white);font-size:16px">Share Your Feedback</h3><p style="font-size:12px;color:var(--sub)">Help us build a better road.</p><label>Type</label><select id="fbType"><option value="satisfaction">Satisfaction</option><option value="feature_request">Feature Request</option><option value="bug_report">Bug Report</option><option value="general">General</option></select><label>How would you rate your experience? (click a circle)</label><div class="stars" id="fbStars"><span onclick="setScore(1)">&#9679;</span><span onclick="setScore(2)">&#9679;</span><span onclick="setScore(3)">&#9679;</span><span onclick="setScore(4)">&#9679;</span><span onclick="setScore(5)">&#9679;</span><span onclick="setScore(6)">&#9679;</span><span onclick="setScore(7)">&#9679;</span><span onclick="setScore(8)">&#9679;</span><span onclick="setScore(9)">&#9679;</span><span onclick="setScore(10)">&#9679;</span></div><label>Message</label><textarea id="fbMsg" placeholder="Tell us what you think..."></textarea><button onclick="submitFeedback()" style="padding:12px 24px;background:var(--white);color:#000;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-family:var(--sg);align-self:flex-start">Submit</button><div id="fbResult" style="font-size:13px;color:var(--sub)"></div></div></div>

<!-- Support Panel -->
<div class="panel" id="panel-support"><div class="msgs" id="supportMsgs" style="flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:14px"><div class="w"><div style="width:48px;height:3px;border-radius:2px;background:var(--g)"></div><h2>Live Support</h2><p>Celeste is here to help. Ask anything about BlackRoad OS.</p><button class="sb" onclick="startSupport()">Start Chat</button></div></div><div class="ia" id="supportIA" style="display:none"><input type="text" id="supportInp" placeholder="Describe your issue..." autocomplete="off"><button onclick="sendSupport()">Send</button></div></div>

<script>
let sid=null,fbScore=0,supportTicket=null,activeTab='chat';
const ms=document.getElementById('msgs');

function showTab(tab){activeTab=tab;document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));document.getElementById('panel-'+tab).classList.add('active');if(tab==='tours')loadTours();if(tab==='kb')loadKB();if(tab==='badges')loadBadges();}

function add(container,r,t,agent){const el=typeof container==='string'?document.getElementById(container):container;const d=document.createElement('div');d.className='msg '+(r==='assistant'?'mr':'mu');if(r==='assistant')d.innerHTML='<div class="ma">'+(agent||'A').charAt(0)+'</div><div><div class="mn">'+(agent||'ALICE').toUpperCase()+'</div><div class="mb">'+t.replace(/\\n/g,'<br>')+'</div></div>';else d.innerHTML='<div class="mb">'+t+'</div>';el.appendChild(d);el.scrollTop=el.scrollHeight;}

function up(s){for(let i=0;i<5;i++)document.getElementById('p'+i).className='pd'+(i<=s?' done':'');}

async function go(){const n=document.getElementById('ni').value.trim()||'friend';document.getElementById('w').style.display='none';document.getElementById('ia').style.display='flex';document.getElementById('inp').focus();const r=await fetch('/api/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n})});const d=await r.json();sid=d.session_id;add('msgs','assistant',d.message,'Alice');up(0);}

async function send(){const i=document.getElementById('inp');const m=i.value.trim();if(!m||!sid)return;i.value='';add('msgs','user',m);const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sid,message:m})});const d=await r.json();add('msgs','assistant',d.message,'Alice');up(d.step);if(d.completed)document.getElementById('ia').innerHTML='<div style="text-align:center;width:100%;padding:8px;color:var(--sub);font-size:13px">All set. <a href="https://blackroad.io" style="color:var(--white)">Enter BlackRoad</a></div>';}

// Tours
async function loadTours(){const r=await fetch('/api/tours');const d=await r.json();const el=document.getElementById('tourList');el.innerHTML=d.tours.map(t=>'<div class="tour-card" onclick="startTour(\\''+t.id+'\\')"><h4>'+t.name+'</h4><p style="font-size:12px;color:var(--sub)">'+t.description+'</p><div class="tour-meta">'+t.steps.length+' steps | '+t.estimated_time+'</div></div>').join('');}

async function startTour(id){const r=await fetch('/api/tours/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tour:id,user_id:sid||'visitor'})});const d=await r.json();if(d.error){alert(d.error);return;}const el=document.getElementById('tourList');el.innerHTML='<div style="padding:20px"><h3 style="color:var(--white);margin-bottom:12px">'+d.title+'</h3><p style="color:var(--sub);font-size:13px;margin-bottom:16px">'+d.intro+'</p><div id="tourStep" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px"><h4 style="color:var(--white)">Step '+(d.current_step+1)+' of '+d.total_steps+'</h4><p style="color:var(--sub);font-size:13px;margin:8px 0">'+d.first_step.title+'</p><p style="color:var(--muted);font-size:12px">'+d.first_step.description+'</p></div><button onclick="advanceTour(\\''+d.tour_id+'\\','+d.total_steps+')" style="margin-top:12px;padding:10px 20px;background:var(--white);color:#000;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-family:var(--sg)">Complete Step</button></div>';}

async function advanceTour(tourId,total){const r=await fetch('/api/tours/step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tour_id:tourId})});const d=await r.json();const el=document.getElementById('tourStep');if(d.completed){el.innerHTML='<h4 style="color:var(--white)">Tour Complete!</h4><p style="color:var(--sub);font-size:13px;margin:8px 0">'+d.note+'</p><div style="width:100%;height:3px;border-radius:2px;background:var(--g);margin-top:8px"></div>';return;}el.innerHTML='<h4 style="color:var(--white)">Step '+(d.current_step+1)+' of '+d.total_steps+'</h4><p style="color:var(--sub);font-size:13px;margin:8px 0">'+(d.current_step_data?.title||'')+'</p><p style="color:var(--muted);font-size:12px">'+(d.current_step_data?.description||'')+'</p><p style="color:var(--sub);font-size:11px;margin-top:8px;font-style:italic">'+d.note+'</p>';el.parentElement.querySelector('button').onclick=()=>advanceTour(tourId,total);}

// Knowledge Base
async function loadKB(q){const url=q?'/api/kb?q='+encodeURIComponent(q):'/api/kb';const r=await fetch(url);const d=await r.json();const el=document.getElementById('kbList');el.innerHTML=d.articles.map(a=>'<div class="kb-item" onclick="showArticle(\\''+a.id+'\\')"><h4>'+a.title+'</h4><p>'+a.body.slice(0,120)+'...</p><div class="kb-meta"><span>'+a.category+'</span><span>Helpful: '+a.helpful+'</span></div></div>').join('');if(!d.articles.length)el.innerHTML='<div style="padding:20px;text-align:center;color:var(--sub)">No articles found.</div>';}

function searchKB(){const q=document.getElementById('kbSearch').value.trim();loadKB(q);}

async function showArticle(id){const r=await fetch('/api/kb/'+id);const d=await r.json();if(!d.article)return;const a=d.article;const el=document.getElementById('kbList');el.innerHTML='<div style="padding:4px"><button onclick="loadKB()" style="background:none;border:none;color:var(--sub);cursor:pointer;font-size:12px;margin-bottom:12px">&larr; Back</button><h3 style="color:var(--white);margin-bottom:8px">'+a.title+'</h3><div style="font-size:11px;color:var(--muted);margin-bottom:12px">'+a.category+'</div><p style="font-size:13px;color:var(--text);line-height:1.8">'+a.body+'</p><div style="margin-top:16px;display:flex;gap:8px"><button onclick="voteKB(\\''+a.id+'\\',\\'helpful\\')" style="padding:8px 16px;background:var(--card);border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;font-size:12px">Helpful ('+a.helpful+')</button><button onclick="voteKB(\\''+a.id+'\\',\\'not_helpful\\')" style="padding:8px 16px;background:var(--card);border:1px solid var(--border);border-radius:6px;color:var(--sub);cursor:pointer;font-size:12px">Not helpful ('+a.not_helpful+')</button></div></div>';}

async function voteKB(id,vote){await fetch('/api/kb/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({article_id:id,vote})});showArticle(id);}

document.getElementById('kbSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter')searchKB();});

// Badges
async function loadBadges(){const userId=sid||'visitor';const r=await fetch('/api/badges/'+userId);const d=await r.json();const earned=new Set((d.earned||[]).map(b=>b.badge_key));const all=await fetch('/api/badges').then(r=>r.json());const el=document.getElementById('badgeGrid');el.innerHTML='<div style="grid-column:1/-1;padding:8px 0"><p style="font-size:13px;color:var(--sub)">'+d.total_earned+' of '+d.total_available+' badges earned ('+d.progress_pct+'%)</p><div style="width:100%;height:4px;background:var(--border);border-radius:2px;margin-top:6px"><div style="width:'+d.progress_pct+'%;height:100%;background:var(--g);border-radius:2px"></div></div></div>'+(all.available_badges||[]).map(b=>'<div class="badge-card '+(earned.has(b.key)?'earned':'')+'"><div class="badge-icon">'+(earned.has(b.key)?'&#9733;':'&#9675;')+'</div><h5>'+b.name+'</h5><p>'+b.description+'</p></div>').join('');}

// Feedback
function setScore(n){fbScore=n;document.querySelectorAll('#fbStars span').forEach((s,i)=>s.className=i<n?'on':'');}

async function submitFeedback(){const type=document.getElementById('fbType').value;const msg=document.getElementById('fbMsg').value.trim();if(!msg&&!fbScore){document.getElementById('fbResult').textContent='Please add a score or message.';return;}const r=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,score:fbScore||null,message:msg,session_id:sid})});const d=await r.json();document.getElementById('fbResult').textContent=d.thank_you||'Thank you!';document.getElementById('fbMsg').value='';fbScore=0;document.querySelectorAll('#fbStars span').forEach(s=>s.className='');}

// Support
async function startSupport(){const el=document.getElementById('supportMsgs');el.innerHTML='';document.getElementById('supportIA').style.display='flex';document.getElementById('supportInp').focus();const r=await fetch('/api/support',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:sid||'visitor',message:'I need help getting started with BlackRoad OS'})});const d=await r.json();supportTicket=d.ticket_id;d.messages.forEach(m=>add('supportMsgs',m.role==='user'?'user':'assistant',m.content,'Celeste'));}

async function sendSupport(){const i=document.getElementById('supportInp');const m=i.value.trim();if(!m||!supportTicket)return;i.value='';add('supportMsgs','user',m);const r=await fetch('/api/support',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket_id:supportTicket,message:m,user_id:sid||'visitor'})});const d=await r.json();const last=d.messages[d.messages.length-1];if(last&&last.role==='assistant')add('supportMsgs','assistant',last.content,'Celeste');if(d.status==='resolved')document.getElementById('supportIA').innerHTML='<div style="text-align:center;width:100%;padding:8px;color:var(--sub);font-size:13px">Ticket resolved. <a href="#" onclick="startSupport()" style="color:var(--white)">Start new chat</a></div>';}

document.getElementById('inp')?.addEventListener('keydown',e=>{if(e.key==='Enter')send();});
document.getElementById('ni')?.addEventListener('keydown',e=>{if(e.key==='Enter')go();});
document.getElementById('supportInp')?.addEventListener('keydown',e=>{if(e.key==='Enter')sendSupport();});
</script></body></html>`;
