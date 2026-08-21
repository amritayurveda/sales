// scripts/import_user_schemes.js
const fs = require('fs');
const path = require('path');

const rawText = `SC00968	Peeda Bhasm	₹3,600
SC00974	Piles Bhasm 45	₹2,990
SC00984	Peeda Bhasm	₹2,500
SC00989	Peeda Bhasm	₹2,100
SC00995	RSO PLUS	₹3,600
SC01011	RSO Rare Slimming Oil	₹3,100
SC01021	Peeda Bhasm	₹2,700
SC01057	Peeda Bhasm Single Pack	₹990
SC01079	RSO Rare Slimming Oil	₹2,700
SC01093	Aarogya Netram	₹3,600
SC01104	HCY WITH CHAIN	₹2,700
SC01106	Aarogya Netram	₹2,500
SC01113	Aarogya Netram	₹3,100
SC01130	GUT AROGYA	₹3,600
SC01137	Aarogya Netram	₹2,700
SC01167	Aarogya Netram	₹2,100
SC01184	Peeda Bhasm Single Pack	₹599
SC01209	Aarogya Netram	₹1,800
SC01222	Nasha Shunyam	₹3,600
SC01235	Nasha Shunyam	₹2,100
SC01242	Nasha Shunyam	₹2,500
SC01311	Aarogya Netram Eyedrop	₹1,100
SC01330	HCY WITH CHAIN	₹3,100
SC01372	HCY WITH CHAIN	₹2,100
SC01391	Nasha Shunyam	₹2,700
SC01462	GUT AROGYA	₹3,100
SC01463	GUT AROGYA	₹2,700
SC01464	GUT AROGYA	₹2,500
SC01465	GUT AROGYA	₹1,700
SC01490	GUT AROGYA	₹2,100
SC01491	Nasha Shunyam	₹1,300
SC01492	GUT AROGYA	₹1,899
SC01493	RSO Rare Slimming Oil	₹2,500
SC01494	RSO PLUS	₹2,100
SC01495	RSO Single Pack	₹1,500
SC01496	Peeda Bhasm Single Pack	₹1,199
SC01498	Aarogya Netram	₹1,499
SC01499	HCY WITH CHAIN	₹1,499
SC01500	RSO Rare Slimming Oil	₹1,499
SC01501	GUT AROGYA	₹1,499
SC01502	Peeda Bhasm	₹1,499
SC01510	RSO Rare Slimming Oil	₹1,800
SC01512	GUT AROGYA	₹1,800
SC01513	RSO Single Pack - Rare Slimming Oil	₹1,200
SC01518	Piles Bhasm 45 New	₹2,990
SC01520	RSO Single Pack - Rare Slimming Oil	₹1,700
SC01522	Piles Bhasm 45 New	₹2,100
SC01523	Piles Bhasm 45 New	₹1,800
SC01527	Piles Bhasm 45	₹3,600
SC01546	HCY WITH CHAIN	₹2,500
SC01552	Cure Vision	₹3,600
SC01553	Cure Vision	₹2,500
SC01556	Cure Vision	₹2,990
SC01557	Cure Vision	₹2,990
SC01558	RSO Rare Slimming Oil	₹1,300
SC01559	Cure Vision	₹1,499
SC01560	Piles Bhasm 45 New	₹1,499
SC01565	RSO Single Pack	₹1,529
SC01566	Aarogya Netram	₹2,099
SC01567	RSO Rare Slimming Oil	₹2,299
SC01568	RSO Rare Slimming Oil	₹1,999
SC01569	Aarogya Netram	₹1,999
SC01570	Piles Bhasm 45 New	₹1,699
SC01571	GUT AROGYA	₹1,999
SC01572	Cure Vision	₹1,999
SC01573	Peeda Bhasm	₹1,999
SC01575	Aarogya Netram	₹1,300
SC01576	Kala Ghoda Combo	₹1,999
SC01577	Aarogya Netram	₹1,699
SC01578	RSO Rare Slimming Oil	₹1,699
SC01581	Piles Bhasm 45 New	₹1,999
SC01584	GUT AROGYA	₹1,300
SC01587	Piles Bhasm 45 New	₹2,500
SC01589	Zero Addiction Advanced	₹3,600
SC01590	Zero Addiction Advanced	₹3,100
SC01591	Piles Bhasm 45 New	₹2,700
SC01592	Zero Addiction Advanced	₹2,500
SC01593	Zero Addiction Advanced	₹2,700
SC01596	Zero Addiction Advanced	₹1,800
SC01597	Piles Bhasm 45 New	₹2,300
SC01598	RSO Rare Slimming Oil	₹2,300
SC01599	Aarogya Netram	₹2,300
SC01600	Zero Addiction Advanced	₹2,300
SC01610	Zero Addiction Advanced	₹1,999
SC01611	Zero Addiction Advanced	₹2,100
SC00001	Alcoban Plus	₹3,100
SC00003	Dhuan Dhaar Plus	₹3,600
SC00017	Udar Sanjivani	₹2,100
SC00018	Udar Sanjivani	₹1,999
SC00019	Udar Sanjivani	₹2,500
SC00020	Udar Sanjivani	₹3,600
BESC00031	Udar Sanjivani	₹1,700
BESC00032	Dhuan Dhaar Plus	₹2,100
SC00033	Alcoban Plus	₹1,690
SC00044	Alcoban Plus	₹1,300
BESC00049	Dhuan Dhaar Plus	₹3,240
BESC00065	Tribal Slimming Oil  1+1	₹2,100
SC00066	Dhuan Dhaar Plus	₹1,960
BESC00071	Tribal Black Hair Oil	₹3,940
BESC00073	Tribal Black Hair Oil	₹3,700
SC00078	Tribal Black Hair Oil	₹3,600
SC00080	Tribal Black Hair Oil	₹3,330
BESC00082	FSD Tribal Black Hair Oil	₹3,400
BESC00084	Tribal Black Hair Oil	₹2,950
BESC00087	FSD  Dhuandhaar Plus	₹2,950
BESC00092	RajVilas	₹2,950
BESC00100	Drink Stop Ayurvedic Drops	₹3,700
SC00102	Tribal Slimming Oil  1+1	₹2,200
BESC00104	Dhuan Dhaar Plus	₹3,300
BESC00105	RAJVILAS	₹2,650
BESC00118	FSD Tribal Black Hair Oil	₹2,500
BESC00119	FSD Dhuan Dhaar Plus	₹2,500
BESC00123	TSO+ (Tribal Slimming Oil)	₹3,700
BESC00125	Web Tribal Black Hair Oil	₹2,999
SC00128	Dhuan Dhaar Plus	₹3,900
BESC00129	Web TSO (Tribal Slimming Oil 1+1)	₹2,499
BESC00131	Dhuan Dhaar Plus	₹3,700
BESC00135	TRIBAL SLIMMING OIL PLUS	₹3,700
BESC00147	FSD Drink Stop Ayurvedic Drops	₹2,500
SC00152	Hanuman Chalisa Yantra	₹2,999
BESC00153	Hanuman Chalisa Yantra	₹2,499
BESC00156	Damdar Oil	₹3,900
BESC00157	Damdar Oil	₹3,700
SC00160	Harjod	₹4,300
BESC00163	Damdar Oil	₹3,450
SC00165	TRIBAL SLIMMING OIL PLUS	₹3,450
BESC00167	FSD Damdar Oil	₹2,999
SC00171	Udar Sanjivani	₹3,900
BESC00190	FSD RajVilas	₹2,499
BESC00191	FSD Damdar Oil	₹2,699
SC00199	Tribal Slimming Oil  1+1	₹1,977
BESC00203	Supragut 70	₹4,300
BESC00204	Supragut 70	₹3,990
BESC00205	Tribal Black Hair Oil	₹2,900
BESC00206	Tribal Black Hair Oil	₹2,500
BESC00207	Tribal Slimming Oil	₹1,900
BESC00208	Hanuman Chalisa Yantra	₹4,300
SC00209	Hanuman Chalisa Yantra	₹3,990
SC00211	Sure Vision	₹3,900
BESC00213	Web Tribal Black Hair Oil	₹1,999
BESC00224	Money Ratnam	₹4,300
BESC00226	Money Ratnam	₹5,200
BESC00228	Supragut 70	₹2,999
BESC00233	Ramban Drinkstop	₹3,800
BESC00234	Ramban Drinkstop	₹3,550
BESC00235	Money Ratnam	₹4,900
BESC00240	Money Ratnam	₹3,599
SC00246	TRIBAL SLIMMING OIL PLUS	₹3,550
SC00247	TRIBAL SLIMMING OIL PLUS	₹3,800
BESC00247	Damdar Oil	₹3,550
BESC00248	Damdar Oil	₹3,800
BESC00249	Rajvilas	₹2,750
BESC00250	RajVilas	₹3,050
SC00258	Everester	₹2,499
SC00262	Tribal Slimming Oil Single Bottle	₹1,499
BESC00264	Money Ratnam	₹2,999
BESC00265	FSD Money Ratnam	₹4,300
BESC00266	FSD Damdar Oil	₹2,599
BESC00267	FSD Damdar Oil	₹2,299
BESC00269	FSD Mahadamdar Oil	₹2,599
BESC00275	FSD Supragut 70	₹3,600
BESC00276	FSD Supragut 70	₹2,999
BESC00277	FSD Supragut 70	₹2,599
SC00278	FSD Drink Stop Ayurvedic Drops	₹1,999
BESC00279	FSD Rajvilas	₹2,950
BESC00280	FSD Rajvilas	₹2,650
BESC00281	FSD Rajvilas	₹1,999
BESC00282	FSD Tribal Black Hair Oil	₹2,950
BESC00283	FSD Tribal Black Hair Oil	₹1,999
BESC00296	Web Damdar Oil	₹2,999
BESC00297	Web Damdar Oil	₹2,699
BESC00298	Web Supragut 70	₹2,599
BESC00300	Web Damdar Oil	₹2,599
BESC00301	Web Damdar Oil	₹2,299
SC00306	SMS Damdar Oil	₹3,250
SC00308	SMS-Ramban Drink Stop	₹3,250
SC00315	Slimtonic	₹4,300
BESC00316	FSD Ramban Drink Stop	₹2,999
BESC00317	FSD Ramban Drink Stop	₹2,650
SC00323	Slimtonic	₹4,900
SC00324	Money Ratnam	₹4,500
BESC00324	Money Ratnam	₹4,600
BESC00325	Money Ratnam	₹4,200
BESC00326	Slimtonic	₹4,500
BESC00327	Slimtonic	₹4,100
BESC00328	Everester COD	₹1,999
BESC00338	Harjod	₹3,550
BESC00339	Harjod	₹3,800
BESC00345	FSD Slimtonic	₹3,600
BESC00347	CS Damdar Oil COD	₹2,299
BESC00348	CS Damdar Oil COD	₹2,499
BESC00352	CS Supragut 70 COD	₹2,599
BESC00354	CS Damdar Oil COD	₹2,699
BESC00355	Money Ratnam	₹3,999
BESC00356	CS RajVilas COD	₹1,999
BESC00362	CS Damdar Oil COD	₹3,550
BESC00364	Slimtonic	₹3,940
BESC00365	Money Ratnam	₹3,940
BESC00379	CS Sandhi Sudha Plus COD	₹1,700
BESC00381	FSD Mahadamdar Oil	₹1,999
BESC00409	CS Money Ratnam COD	₹2,999
BESC00439	Swarn Vilas	₹3,800
BESC00463	Swarn Vilas	₹3,940
BESC00467	CS Noni D Care 1+1 COD	₹1,999
BESC00469	CS Noni D Care 1+1+1 COD	₹2,599
BESC00470	CS Noni D Care 1+1+1 COD	₹2,999
BESC00471	CS Noni D Care 1+1+1 COD	₹3,600
BESC00472	CS Noni D Care 1+1+1 COD	₹3,800
BESC00473	Swarn Vilas	₹3,700
BESC00477	Slimtonic	₹3,700
BESC00478	Swarn Vilas	₹3,550
BESC00479	FSD Money Ratnam	₹2,999
BESC00480	FSD Money Ratnam	₹2,499
BESC00481	FSD Ramban Drink Stop	₹2,299
BESC00482	FSD Slimtonic	₹3,399
BESC00483	FSD Slimtonic	₹2,999
BESC00484	CS Harjod COD	₹2,499
BESC00498	Damdar Oil	₹3,940
BESC00499	Ramban Drinkstop	₹3,940
BESC00500	Ramban Drinkstop	₹3,700
BESC00501	Money Ratnam	₹3,700
BESC00503	Swarn Vilas	₹3,500
BESC00504	FSD Swarn Vilas	₹2,999
BESC00507	CS Ramban Drinkstop COD	₹2,250
SC00518	Money Ratnam	₹2,950
BESC00518	Money Ratnam	₹3,500
BESC00520	FSD ExtraS damdar	₹1,999
BESC00524	CS Damdar Extra	₹1,999
BESC00525	CS Swarn Vilas	₹2,999
BESC00526	CS Money Ratnam	₹2,499
BESC00528	FSD Slimtonic	₹2,499
SC00530	Damdar Oil	₹3,760
BESC00530	Money Ratnam	₹3,499
BESC00531	RajVilas	₹2,999
BESC00532	Swarn Vilas	₹3,499
BESC00533	Damdar IND	₹2,999
BESC00534	Damdar IN	₹2,499
SC00536	IN Ramban Drinkstop	₹2,500
SC00537	IN Money Ratnam	₹2,500
SC00538	IN Swarn Vilas	₹2,500
SC00539	IN Slimtonic	₹2,500
BESC00542	Tribal Black Oil	₹3,500
BESC00545	Web Hanuman Chalisa Yantra	₹2,299
BESC00548	Web Udar Sanjivani 2 Bottle	₹1,600
BESC00551	Web Noni D Care 2 Bottle	₹1,600
BESC00559	Web TSO 2 Bottle	₹1,960
BESC00560	Web Udar Sanjivani Single	₹1,240
BESC00561	Web Udar Sanjivani Pack of 2	₹1,960
BESC00562	Web Slimtonic Single	₹1,240
BESC00563	Web Slimtonic 2 Bottle	₹1,960
BESC00564	Web Everester	₹1,240
BESC00565	Web Alcoban Plus	₹1,240
BESC00567	M Ramban Drinkstop	₹3,700
BESC00568	M Ramban Drinkstop	₹3,940
BESC00569	Web Udar Sanjivani 2 Bottle	₹1,800
BESC00570	Web Everester	₹1,699
BESC00571	Web Everester	₹1,600
BESC00575	Pushtivardhnam	₹3,940
BESC00576	Pushtivardhnam	₹3,700
BESC00577	Web Udar Sanjivani Single	₹1,330
BESC00578	Web TSO Single	₹1,330
BESC00579	Web Slimtonic Single	₹1,330
BESC00582	Web Rajvilas	₹1,960
BESC00584	Web TribaSlim Oil Plus	₹1,960
BESC00585	Web TSO Single	₹1,420
BESC00586	Web Udar Sanjivani Single	₹1,420
BESC00587	Web Alcoban Plus	₹1,420
BESC00591	Supragut 70 Full Pack	₹2,599
BESC00592	Web Supragut 70	₹1,960
BESC00597	Web Supragut 70	₹2,299
BESC00598	FSD Pushtivardhnam	₹2,999
BESC00599	FSD Pushtivardhnam	₹2,699
BESC00602	Hightonic	₹3,940
SC00604	Hightonic	₹3,760
BESC00604	Web Rajvilas	₹1,690
SC00606	Damdar Oil	₹3,985
SC00607	Damdar Oil	₹3,580
SC00609	Damdar Oil	₹3,355
SC00610	Damdar Oil	₹2,950
SC00612	Damdar Oil	₹2,770
SC00614	Damdar Oil	₹2,500
SC00615	Damdar Oil	₹2,275
SC00625	Ramban Drink Stop	₹3,985
SC00626	Ramban Drink Stop	₹3,760
SC00627	Ramban Drink Stop	₹3,580
SC00629	Ramban Drink Stop	₹3,355
SC00630	Ramban Drink Stop	₹2,950
SC00632	Ramban Drink Stop	₹2,770
SC00634	Ramban Drink Stop	₹2,500
SC00635	Ramban Drink Stop	₹2,275
SC00636	Hightonic	₹3,985
SC00637	Hightonic	₹3,580
SC00639	Hightonic	₹3,355
SC00640	Hightonic	₹2,950
SC00642	Hightonic	₹2,770
SC00644	Hightonic	₹2,500
SC00645	Hightonic	₹2,275
SC00646	Hightonic	₹1,960
SC00647	Pushtivardhnam	₹3,985
SC00648	Pushtivardhnam	₹3,760
SC00649	Pushtivardhnam	₹3,580
SC00651	Pushtivardhnam	₹3,355
SC00652	Pushtivardhnam	₹2,950
SC00654	Pushtivardhnam	₹2,770
SC00656	Pushtivardhnam	₹2,500
SC00657	Pushtivardhnam	₹2,275
SC00658	Pushtivardhnam	₹1,960
SC00659	Slimtonic	₹3,985
SC00660	Slimtonic	₹3,760
SC00661	Slimtonic	₹3,580
SC00663	Slimtonic	₹3,355
SC00664	Slimtonic	₹2,950
SC00666	Slimtonic	₹2,770
SC00668	Slimtonic	₹2,500
SC00669	Slimtonic	₹2,275
SC00670	Slimtonic 500ml 1+1	₹1,960
SC00672	Slimtonic 500ml	₹1,420
SC00674	Money Ratnam	₹3,985
SC00675	Money Ratnam	₹3,760
SC00676	Money Ratnam	₹3,580
SC00678	Money Ratnam	₹3,355
SC00680	Money Ratnam	₹2,770
SC00682	Money Ratnam	₹2,500
SC00683	Money Ratnam	₹2,275
SC00687	Swarn Vilas	₹3,985
SC00688	Swarn Vilas	₹3,760
SC00689	Swarn Vilas	₹3,580
SC00691	Swarn Vilas	₹3,355
SC00692	Swarn Vilas	₹2,950
SC00694	Swarn Vilas	₹2,770
SC00696	Swarn Vilas	₹2,500
SC00697	Swarn Vilas	₹2,275
SC00698	Swarn Vilas	₹1,960
SC00699	Rajvilas	₹2,455
SC00700	Rajvilas	₹2,275
SC00701	Rajvilas	₹1,960
SC00702	Rajvilas	₹1,690
SC00704	Udar Sanjivani Single 1+1	₹1,960
SC00706	Udar Sanjivani Single	₹1,690
SC00707	Udar Sanjivani Single	₹1,420
SC00709	Hanuman Chalisa Yantra	₹2,455
SC00710	Hanuman Chalisa Yantra	₹2,275
SC00712	Hanuman Chalisa Yantra	₹1,960
SC00722	Everester	₹1,600
SC00723	Everester	₹1,420
SC00724	Everester	₹1,240
SC00726	Supragut 70	₹3,985
SC00727	Supragut 70	₹3,760
SC00728	Supragut 70	₹3,580
SC00730	Supragut 70	₹3,355
SC00731	Supragut 70	₹2,950
SC00733	Supragut 70	₹2,770
SC00735	Supragut 70	₹2,500
SC00736	Supragut 70	₹2,275
SC00737	Supragut 70	₹1,960
BESC00737	Noni D Care 500ml 1+1+1	₹2,950
BESC00738	Noni D Care 500ml 1+1+1	₹2,770
BESC00739	Noni D Care 500ml 1+1+1	₹2,590
SC00742	Noni D Care 500ml 1+1	₹2,320
SC00743	Noni D Care 500ml 1+1	₹1,960
SC00777	Alcoban 3 Bottle	₹1,420
SC00779	Dhuan Dhaar Plus	₹2,140
SC00780	Dhuan Dhaar Plus	₹1,600
SC00784	TSO	₹1,600
SC00785	TSO 1+1	₹1,600
SC00787	TSO 1+1	₹1,960
SC00788	Damdar Oil	₹1,996
SC00790	Alcoban 3 Bottle	₹1,960
SC00794	Rajvilas	₹3,040
SC00795	Rajvilas	₹2,770
BESC00796	Noni D Care 500ml 1+1+1	₹3,490
SC00799	Damdar Oil	₹3,130
SC00807	Ramban Drink Stop	₹3,130
SC00810	Hightonic	₹3,130
SC00814	Pushtivardhnam	₹3,130
SC00818	Slimtonic	₹3,130
SC00822	Money Ratnam	₹3,130
SC00824	Money Ratnam	₹1,960
SC00826	Swarn Vilas	₹3,130
SC00830	Noni D Care 500ml 1+1	₹3,400
SC00831	Noni D Care 500ml 1+1	₹2,950
SC00833	Noni D Care 500ml 1+1	₹3,220
SC00836	Noni D Care 500ml 1+1	₹2,770
SC00837	Noni D Care 500ml 1+1	₹2,500
SC00841	Slimtonic Single Bottle	₹1,300
SC00842	Slimtonic Double Bottle	₹1,800
SC00843	Slimtonic	₹2,999`;

function classifyProduct(schemeName) {
  const s = schemeName.toUpperCase();
  if (s.includes('DAMDAR') || s.includes('DHUAN') || s.includes('DHUANDHAAR')) return 'DAMADAR OIL';
  if (s.includes('PEEDA BHASM')) return 'PEEDA BHASM';
  if (s.includes('PILES BHASM')) return 'PILES BHASM';
  if (s.includes('RSO') || s.includes('SLIMMING OIL') || s.includes('TSO')) {
    if (s.includes('RSO')) return 'RSO RARE SLIMMING OIL';
    return 'TSO (TRIBAL SLIMMING OIL)';
  }
  if (s.includes('AAROGYA NETRAM')) return 'AAROGYA NETRAM';
  if (s.includes('HANUMAN') || s.includes('HCY')) return 'HANUMAN CHALISA YANTRA (HCY)';
  if (s.includes('GUT AROGYA') || s.includes('SUPRAGUT')) return 'GUT AROGYA / SUPRAGUT';
  if (s.includes('NASHA SHUNYAM') || s.includes('ZERO ADDICTION')) return 'ZERO ADDICTION / NASHA SHUNYAM';
  if (s.includes('ALCOBAN')) return 'ALCOBAN PLUS';
  if (s.includes('DRINK STOP') || s.includes('DRINKSTOP')) return 'DRINK STOP AYURVEDIC';
  if (s.includes('CURE VISION') || s.includes('SURE VISION')) return 'CURE VISION';
  if (s.includes('UDAR SANJIVANI')) return 'UDAR SANJIVANI';
  if (s.includes('TRIBAL BLACK')) return 'TRIBAL BLACK HAIR OIL';
  if (s.includes('RAJVILAS')) return 'RAJVILAS';
  if (s.includes('HARJOD')) return 'HARJOD';
  if (s.includes('MONEY RATNAM')) return 'MONEY RATNAM';
  if (s.includes('EVERESTER')) return 'EVERESTER';
  if (s.includes('SLIMTONIC')) return 'SLIMTONIC';
  if (s.includes('SWARN VILAS')) return 'SWARN VILAS';
  if (s.includes('NONI D CARE')) return 'NONI D CARE';
  if (s.includes('PUSHTIVARDHNAM')) return 'PUSHTIVARDHNAM';
  if (s.includes('HIGHTONIC')) return 'HIGHTONIC';
  if (s.includes('SANDHI SUDHA')) return 'SANDHI SUDHA';
  if (s.includes('KALA GHODA')) return 'KALA GHODA';
  return 'OTHER AYURVEDIC PRODUCTS';
}

function parseSchemes() {
  const lines = rawText.trim().split('\n');
  const productMap = {};

  lines.forEach(line => {
    const parts = line.split('\t');
    if (parts.length < 3) return;
    const code = parts[0].trim();
    const desc = parts[1].trim();
    const priceStr = parts[2].replace(/[₹, ]/g, '').trim();
    const price = parseInt(priceStr, 10) || 0;

    const mainCategory = classifyProduct(desc);

    if (!productMap[mainCategory]) {
      productMap[mainCategory] = [];
    }

    const schemeDisplayName = `${code} - ${desc} (₹${price.toLocaleString('en-IN')})`;

    productMap[mainCategory].push({
      id: code,
      code: code,
      name: schemeDisplayName,
      desc: desc,
      qty: 1,
      price: price,
      dc: price <= 1500 ? 170 : 250
    });
  });

  const masterCatalog = [];
  let pIdx = 1;
  Object.keys(productMap).sort().forEach(pName => {
    const schemes = productMap[pName];
    // Sort schemes by price descending
    schemes.sort((a, b) => b.price - a.price);

    masterCatalog.push({
      id: 'prod_' + (pIdx++),
      name: pName,
      defaultPrice: schemes[0] ? schemes[0].price : 2500,
      schemes: schemes
    });
  });

  return masterCatalog;
}

const masterCatalog = parseSchemes();
console.log(`Generated ${masterCatalog.length} Master Products with ${masterCatalog.reduce((s, p) => s + p.schemes.length, 0)} total schemes!`);

// Export to json
const outputPath = path.join(__dirname, '../data/master_catalog.json');
fs.writeFileSync(outputPath, JSON.stringify(masterCatalog, null, 2), 'utf8');
console.log('Saved to:', outputPath);

// Update database.json directly
const dbPath = path.join(__dirname, '../data/database.json');
if (fs.existsSync(dbPath)) {
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  db.products = masterCatalog;

  // Re-link districtProducts to use this master catalog with initial allocated stock
  const DISTRICTS = [
    "Chittorgarh", "Alwar", "Bikaner", "Uttarakhand", "Udham Singh Nagar", "Jodhpur",
    "Kota", "Faridabad", "Gurgaon", "Rewari", "Muzaffarnagar", "Shamli"
  ];

  if (!db.districtProducts) db.districtProducts = {};

  DISTRICTS.forEach(dist => {
    db.districtProducts[dist] = masterCatalog.map(mp => ({
      id: `dp_${dist.toLowerCase().slice(0, 3)}_${mp.id}`,
      productId: mp.id,
      name: mp.name,
      stockAllocated: 20,
      currentStock: 20,
      schemes: mp.schemes
    }));
  });

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
  console.log('Successfully updated database.json with 100% full master catalog & all 12 districts!');
}
