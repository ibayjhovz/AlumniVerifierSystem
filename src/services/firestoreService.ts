import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { firestore, auth } from './firebase.js';
import { INITIAL_SEED_DATA } from './seedData.js';
import {
  Alumni,
  AcademicRecord,
  AlumniCard,
  AlumniQRCode,
  VerificationLog,
  ActivityLog,
  AdminStats,
  PublicVerificationResponse,
  CardStatus,
  QRStatus,
  VerificationStatusResult
} from '../types/alumni.js';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export class FirestoreDatabaseService {
  private isSeeding = false;

  private normalizeToken(token: string): string {
    return (token || '').trim();
  }

  /**
   * Automatically verifies that the central cloud database is populated.
   * If Firestore is empty (e.g. fresh environment or new browser connection),
   * seeds the official university records directly into Cloud Firestore.
   */
  public async ensureDatabaseSeeded(): Promise<void> {
    if (this.isSeeding) return;
    try {
      this.isSeeding = true;
      const snap = await getDocs(collection(firestore, 'alumni'));
      if (snap.empty) {
        console.log('[Firestore] Central cloud database is unseeded. Populating authoritative Panpacific University records...');
        for (const alumnus of INITIAL_SEED_DATA.alumni) {
          await setDoc(doc(firestore, 'alumni', alumnus.alumni_id), alumnus);
        }
        for (const record of INITIAL_SEED_DATA.academic_records) {
          await setDoc(doc(firestore, 'academic_records', record.id), record);
        }
        for (const card of INITIAL_SEED_DATA.cards) {
          await setDoc(doc(firestore, 'cards', card.id), card);
        }
        for (const qr of INITIAL_SEED_DATA.qr_codes) {
          await setDoc(doc(firestore, 'qr_codes', qr.id), qr);
        }
        const initLog: ActivityLog = {
          id: 'act-init-' + Date.now(),
          admin_id: 'system@panpacificu.edu.ph',
          action: 'CENTRAL CLOUD DATABASE INITIALIZED & SEEDED',
          target_type: 'AUTH',
          target_id: 'PU-REGISTRY',
          metadata: {
            alumni_count: INITIAL_SEED_DATA.alumni.length,
            note: 'Authoritative Panpacific University records established in central database'
          },
          created_at: new Date().toISOString()
        };
        await setDoc(doc(firestore, 'activity_logs', initLog.id), initLog);
        console.log('[Firestore] Central cloud database populated successfully.');
      }
    } catch (err) {
      console.warn('[Firestore] Central database seeding check skipped/error:', err);
    } finally {
      this.isSeeding = false;
    }
  }

  // --- PUBLIC VERIFICATION ---
  public async verifyLiveToken(rawToken: string, ip = 'web-client', userAgent = navigator.userAgent): Promise<PublicVerificationResponse> {
    const token = this.normalizeToken(rawToken);
    const now = new Date();
    const verified_at = now.toISOString();
    const verification_reference =
      'VER-' +
      now.getFullYear() +
      '-' +
      Math.random().toString(36).substring(2, 8).toUpperCase();

    if (!token) {
      return {
        result: 'NOT_FOUND',
        verification_reference,
        verified_at,
        message: 'No verification token provided.'
      };
    }

    const searchVal = token.toUpperCase();
    const cleanSearchAlpha = searchVal.replace(/[^A-Z0-9]/g, '');
    const cleanSearchNoPrefix = searchVal.replace(/^(PU|AC)-?/, '');

    // 1. Fetch all collections in parallel for fast authoritative resolution
    const [alumniSnap, cardsSnap, qrSnap] = await Promise.all([
      getDocs(collection(firestore, 'alumni')),
      getDocs(collection(firestore, 'cards')),
      getDocs(collection(firestore, 'qr_codes'))
    ]);

    const allAlumni: Alumni[] = alumniSnap.docs.map(d => d.data() as Alumni);
    const allCards: AlumniCard[] = cardsSnap.docs.map(d => d.data() as AlumniCard);
    const allQRs: AlumniQRCode[] = qrSnap.docs.map(d => d.data() as AlumniQRCode);

    // Step 1: Match QR code
    let qr = allQRs.find(
      q =>
        q.qr_value.toUpperCase() === searchVal ||
        q.qr_value.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanSearchAlpha
    );

    let card: AlumniCard | undefined;
    let alumnus: Alumni | undefined;

    if (qr) {
      card = allCards.find(c => c.id === qr!.card_id);
      if (card) {
        alumnus = allAlumni.find(a => a.alumni_id === card!.alumni_id && !a.archived);
      }
    } else {
      // Step 2: Match Alumni ID (e.g. PU-2024-00123, 2024-00123)
      alumnus = allAlumni.find(a => {
        if (a.archived) return false;
        const aid = a.alumni_id.toUpperCase();
        const aidAlpha = aid.replace(/[^A-Z0-9]/g, '');
        const aidNoPrefix = aid.replace(/^PU-?/, '');
        const rawId = (a.id || '').toUpperCase();
        return (
          aid === searchVal ||
          rawId === searchVal ||
          aidAlpha === cleanSearchAlpha ||
          aidNoPrefix === cleanSearchNoPrefix
        );
      });

      if (alumnus) {
        card =
          allCards.find(c => c.alumni_id === alumnus!.alumni_id && c.status === 'ACTIVE') ||
          allCards.find(c => c.alumni_id === alumnus!.alumni_id);
        if (card) {
          qr = allQRs.find(q => q.card_id === card!.id);
        }
      } else {
        // Step 3: Match Card Number (e.g. AC-2024-00123, 2024-00123)
        card = allCards.find(c => {
          const cNum = c.card_number.toUpperCase();
          const cNumAlpha = cNum.replace(/[^A-Z0-9]/g, '');
          const cNumNoPrefix = cNum.replace(/^AC-?/, '');
          return (
            cNum === searchVal ||
            cNumAlpha === cleanSearchAlpha ||
            cNumNoPrefix === cleanSearchNoPrefix
          );
        });

        if (card) {
          alumnus = allAlumni.find(a => a.alumni_id === card!.alumni_id && !a.archived);
          qr = allQRs.find(q => q.card_id === card!.id);
        }
      }
    }

    // Handle NOT FOUND
    if (!alumnus && !card && !qr) {
      const log: VerificationLog = {
        id: 'vlog-' + Date.now(),
        qr_id: null,
        card_id: null,
        alumni_id: null,
        verification_reference,
        result: 'NOT_FOUND',
        verified_at,
        ip_address: ip,
        user_agent: userAgent,
        searched_token: token
      };
      this.logVerification(log).catch(() => {});

      return {
        result: 'NOT_FOUND',
        verification_reference,
        verified_at,
        message: `No alumni record, membership card, or QR token matching "${token}" was found in the official Panpacific University database.`
      };
    }

    // Synthesize active card if alumnus exists without card document
    if (!card && alumnus) {
      card = {
        id: 'card-' + alumnus.alumni_id,
        alumni_id: alumnus.alumni_id,
        card_number: 'AC-' + alumnus.alumni_id.replace(/^PU-/, ''),
        issue_date: alumnus.created_at.slice(0, 10),
        expiration_date: '2031-12-31',
        status: 'ACTIVE',
        created_at: alumnus.created_at,
        updated_at: alumnus.updated_at
      };
    }

    if (!alumnus && card) {
      alumnus = allAlumni.find(a => a.alumni_id === card!.alumni_id);
    }

    if (!alumnus || !card) {
      return {
        result: 'NOT_FOUND',
        verification_reference,
        verified_at,
        message: 'Record incomplete or not found in registry.'
      };
    }

    if (!qr) {
      qr = {
        id: 'qr-' + card.id,
        card_id: card.id,
        qr_value: 'PU-ALUMNI-' + alumnus.alumni_id,
        status: 'ACTIVE',
        uploaded_at: alumnus.created_at,
        updated_at: alumnus.updated_at
      };
    }

    // Fetch Academic Records
    const acadSnap = await getDocs(
      query(collection(firestore, 'academic_records'), where('alumni_id', '==', alumnus.alumni_id))
    );
    const academicRecords: AcademicRecord[] = acadSnap.docs.map(d => d.data() as AcademicRecord);

    const primaryCampus = academicRecords[0]?.campus || 'Urdaneta City Main Campus';
    const fullName = [
      alumnus.first_name,
      alumnus.middle_name,
      alumnus.last_name,
      alumnus.suffix
    ]
      .filter(Boolean)
      .join(' ');

    const order: Record<string, number> = { DOCTORATE: 1, MASTERS: 2, BACHELORS: 3 };
    const sortedDegrees = [...academicRecords].sort((a, b) => {
      return (order[a.degree_level] || 99) - (order[b.degree_level] || 99);
    });

    // Check QR disabled
    if (qr.status === 'DISABLED') {
      const log: VerificationLog = {
        id: 'vlog-' + Date.now(),
        qr_id: qr.id,
        card_id: card.id,
        alumni_id: alumnus.alumni_id,
        verification_reference,
        result: 'DISABLED',
        verified_at,
        ip_address: ip,
        user_agent: userAgent,
        searched_token: token
      };
      this.logVerification(log).catch(() => {});

      return {
        result: 'DISABLED',
        verification_reference,
        verified_at,
        message: 'This specific QR code credential has been disabled by the university administration.'
      };
    }

    // Check Card Revocation
    if (card.status === 'REVOKED') {
      const log: VerificationLog = {
        id: 'vlog-' + Date.now(),
        qr_id: qr.id,
        card_id: card.id,
        alumni_id: alumnus.alumni_id,
        verification_reference,
        result: 'REVOKED',
        verified_at,
        ip_address: ip,
        user_agent: userAgent,
        searched_token: token
      };
      this.logVerification(log).catch(() => {});

      return {
        result: 'REVOKED',
        verification_reference,
        verified_at,
        message: card.revocation_reason || 'This alumni card has been revoked by university authorities.',
        alumni: {
          alumni_id: alumnus.alumni_id,
          full_name: fullName,
          first_name: alumnus.first_name,
          middle_name: alumnus.middle_name,
          last_name: alumnus.last_name,
          suffix: alumnus.suffix,
          photo_url: alumnus.photo_url,
          academic_records: sortedDegrees.map(ar => ({
            degree_level: ar.degree_level,
            degree_program: ar.degree_program,
            college: ar.college,
            major: ar.major,
            graduation_year: ar.graduation_year,
            campus: ar.campus
          })),
          card: {
            card_number: card.card_number,
            issue_date: card.issue_date,
            expiration_date: card.expiration_date,
            status: card.status,
            effective_status: 'REVOKED'
          },
          qr_status: qr.status,
          primary_campus: primaryCampus
        }
      };
    }

    // Check Card Expiration
    const isExpired = card.status === 'EXPIRED' || new Date(card.expiration_date) < now;
    if (isExpired) {
      const log: VerificationLog = {
        id: 'vlog-' + Date.now(),
        qr_id: qr.id,
        card_id: card.id,
        alumni_id: alumnus.alumni_id,
        verification_reference,
        result: 'EXPIRED',
        verified_at,
        ip_address: ip,
        user_agent: userAgent,
        searched_token: token
      };
      this.logVerification(log).catch(() => {});

      return {
        result: 'EXPIRED',
        verification_reference,
        verified_at,
        message: 'The physical alumni card validity period has lapsed. Alumnus remains a verified graduate.',
        alumni: {
          alumni_id: alumnus.alumni_id,
          full_name: fullName,
          first_name: alumnus.first_name,
          middle_name: alumnus.middle_name,
          last_name: alumnus.last_name,
          suffix: alumnus.suffix,
          photo_url: alumnus.photo_url,
          academic_records: sortedDegrees.map(ar => ({
            degree_level: ar.degree_level,
            degree_program: ar.degree_program,
            college: ar.college,
            major: ar.major,
            graduation_year: ar.graduation_year,
            campus: ar.campus
          })),
          card: {
            card_number: card.card_number,
            issue_date: card.issue_date,
            expiration_date: card.expiration_date,
            status: card.status,
            effective_status: 'EXPIRED'
          },
          qr_status: qr.status,
          primary_campus: primaryCampus
        }
      };
    }

    // Successfully VERIFIED
    const log: VerificationLog = {
      id: 'vlog-' + Date.now(),
      qr_id: qr.id,
      card_id: card.id,
      alumni_id: alumnus.alumni_id,
      verification_reference,
      result: 'VERIFIED',
      verified_at,
      ip_address: ip,
      user_agent: userAgent,
      searched_token: token
    };
    this.logVerification(log).catch(() => {});

    return {
      result: 'VERIFIED',
      verification_reference,
      verified_at,
      message: 'Authentic Panpacific University Alumni Credential',
      alumni: {
        alumni_id: alumnus.alumni_id,
        full_name: fullName,
        first_name: alumnus.first_name,
        middle_name: alumnus.middle_name,
        last_name: alumnus.last_name,
        suffix: alumnus.suffix,
        photo_url: alumnus.photo_url,
        academic_records: sortedDegrees.map(ar => ({
          degree_level: ar.degree_level,
          degree_program: ar.degree_program,
          college: ar.college,
          major: ar.major,
          graduation_year: ar.graduation_year,
          campus: ar.campus
        })),
        card: {
          card_number: card.card_number,
          issue_date: card.issue_date,
          expiration_date: card.expiration_date,
          status: card.status,
          effective_status: 'ACTIVE'
        },
        qr_status: qr.status,
        primary_campus: primaryCampus
      }
    };
  }

  // --- ADMIN DIRECTORY & CRUD ---
  public async getAlumniList(params: {
    query?: string;
    program?: string;
    degree_level?: string;
    graduation_year?: string;
    campus?: string;
    card_status?: string;
    qr_status?: string;
    page?: number;
    limit?: number;
  }) {
    const [alumniSnap, acadSnap, cardSnap, qrSnap] = await Promise.all([
      getDocs(collection(firestore, 'alumni')),
      getDocs(collection(firestore, 'academic_records')),
      getDocs(collection(firestore, 'cards')),
      getDocs(collection(firestore, 'qr_codes'))
    ]);

    const alumniList: Alumni[] = alumniSnap.docs.map(d => d.data() as Alumni).filter(a => !a.archived);
    const acadList: AcademicRecord[] = acadSnap.docs.map(d => d.data() as AcademicRecord);
    const cardList: AlumniCard[] = cardSnap.docs.map(d => d.data() as AlumniCard);
    const qrList: AlumniQRCode[] = qrSnap.docs.map(d => d.data() as AlumniQRCode);

    const q = (params.query || '').trim().toLowerCase();
    const now = new Date();

    const enriched = alumniList.map(a => {
      const records = acadList.filter(r => r.alumni_id === a.alumni_id);
      const card = cardList.find(c => c.alumni_id === a.alumni_id && c.status === 'ACTIVE') ||
                   cardList.find(c => c.alumni_id === a.alumni_id);
      const qr = card ? qrList.find(qrcode => qrcode.card_id === card.id) : null;

      let effectiveCardStatus: CardStatus = card?.status || 'EXPIRED';
      if (card && card.status === 'ACTIVE' && new Date(card.expiration_date) < now) {
        effectiveCardStatus = 'EXPIRED';
      }

      return {
        ...a,
        academic_records: records,
        card: card
          ? {
              ...card,
              effective_status: effectiveCardStatus
            }
          : null,
        qr: qr || null,
        primary_degree: records[0]?.degree_program || 'General Studies',
        primary_campus: records[0]?.campus || 'Urdaneta City Main Campus',
        graduation_year: records[0]?.graduation_year || 2024
      };
    });

    let filtered = enriched.filter(item => {
      if (q) {
        const matchesQuery =
          item.alumni_id.toLowerCase().includes(q) ||
          item.first_name.toLowerCase().includes(q) ||
          item.last_name.toLowerCase().includes(q) ||
          (item.email || '').toLowerCase().includes(q) ||
          item.academic_records.some(r => r.degree_program.toLowerCase().includes(q)) ||
          (item.card && item.card.card_number.toLowerCase().includes(q));
        if (!matchesQuery) return false;
      }

      if (params.program && !item.academic_records.some(r => r.degree_program === params.program)) {
        return false;
      }
      if (params.degree_level && !item.academic_records.some(r => r.degree_level === params.degree_level)) {
        return false;
      }
      if (params.graduation_year && !item.academic_records.some(r => String(r.graduation_year) === String(params.graduation_year))) {
        return false;
      }
      if (params.campus && !item.academic_records.some(r => r.campus === params.campus)) {
        return false;
      }
      if (params.card_status && item.card?.effective_status !== params.card_status) {
        return false;
      }
      if (params.qr_status && item.qr?.status !== params.qr_status) {
        return false;
      }

      return true;
    });

    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const page = params.page || 1;
    const limitCount = params.limit || 10;
    const total = filtered.length;
    const totalPages = Math.ceil(total / limitCount) || 1;
    const startIndex = (page - 1) * limitCount;
    const paginated = filtered.slice(startIndex, startIndex + limitCount);

    return {
      items: paginated,
      total,
      page,
      limit: limitCount,
      totalPages,
      pagination: { total, page, limit: limitCount, totalPages }
    };
  }

  public async getAlumnusDetail(alumni_id: string) {
    const cleanId = (alumni_id || '').trim();
    const docRef = doc(firestore, 'alumni', cleanId);
    let alumnusDoc = await getDoc(docRef);

    let alumnus: Alumni | null = null;
    if (alumnusDoc.exists()) {
      alumnus = alumnusDoc.data() as Alumni;
    } else {
      const allAlumniSnap = await getDocs(collection(firestore, 'alumni'));
      const found = allAlumniSnap.docs.find(
        d => (d.data() as Alumni).alumni_id.toUpperCase() === cleanId.toUpperCase()
      );
      if (found) alumnus = found.data() as Alumni;
    }

    if (!alumnus) return null;

    const [acadSnap, cardSnap, qrSnap] = await Promise.all([
      getDocs(query(collection(firestore, 'academic_records'), where('alumni_id', '==', alumnus.alumni_id))),
      getDocs(query(collection(firestore, 'cards'), where('alumni_id', '==', alumnus.alumni_id))),
      getDocs(collection(firestore, 'qr_codes'))
    ]);

    const academic_records: AcademicRecord[] = acadSnap.docs.map(d => d.data() as AcademicRecord);
    const cards: AlumniCard[] = cardSnap.docs.map(d => d.data() as AlumniCard);
    const activeCard = cards.find(c => c.status === 'ACTIVE') || cards[0] || null;
    const qr = activeCard ? qrSnap.docs.map(d => d.data() as AlumniQRCode).find(q => q.card_id === activeCard.id) || null : null;

    return {
      alumnus,
      academic_records,
      card: activeCard,
      cards,
      qr
    };
  }

  public async createAlumnus(payload: {
    alumni_id: string;
    first_name: string;
    middle_name?: string;
    last_name: string;
    suffix?: string;
    photo_url: string;
    email?: string;
    phone?: string;
    academic_records: Omit<AcademicRecord, 'id' | 'alumni_id' | 'created_at' | 'updated_at'>[];
    card: {
      card_number: string;
      issue_date: string;
      expiration_date: string;
      status: CardStatus;
    };
    qr: {
      qr_value: string;
      qr_image_url?: string;
      status: QRStatus;
    };
    admin_id?: string;
  }) {
    const now = new Date().toISOString();
    const cleanAlumniId = payload.alumni_id.trim();

    const newAlumnus: Alumni = {
      id: 'alm-' + Date.now(),
      alumni_id: cleanAlumniId,
      first_name: payload.first_name.trim(),
      middle_name: payload.middle_name?.trim() || '',
      last_name: payload.last_name.trim(),
      suffix: payload.suffix?.trim() || '',
      photo_url: payload.photo_url || '',
      email: payload.email?.trim() || '',
      phone: payload.phone?.trim() || '',
      archived: false,
      created_at: now,
      updated_at: now
    };

    const newAcademicRecords: AcademicRecord[] = payload.academic_records.map((ar, idx) => ({
      id: `acad-${Date.now()}-${idx}`,
      alumni_id: cleanAlumniId,
      degree_level: ar.degree_level,
      degree_program: ar.degree_program.trim(),
      college: ar.college.trim(),
      major: ar.major.trim(),
      graduation_year: ar.graduation_year,
      campus: ar.campus.trim(),
      created_at: now,
      updated_at: now
    }));

    const cardId = 'card-' + Date.now();
    const newCard: AlumniCard = {
      id: cardId,
      alumni_id: cleanAlumniId,
      card_number: payload.card.card_number.trim(),
      issue_date: payload.card.issue_date,
      expiration_date: payload.card.expiration_date,
      status: payload.card.status,
      created_at: now,
      updated_at: now
    };

    const qrId = 'qr-' + Date.now();
    const newQR: AlumniQRCode = {
      id: qrId,
      card_id: cardId,
      qr_value: payload.qr.qr_value.trim(),
      qr_image_url: payload.qr.qr_image_url || '',
      status: payload.qr.status || 'ACTIVE',
      uploaded_at: now,
      updated_at: now
    };

    // Commit all to Firestore
    await setDoc(doc(firestore, 'alumni', cleanAlumniId), newAlumnus);
    for (const ar of newAcademicRecords) {
      await setDoc(doc(firestore, 'academic_records', ar.id), ar);
    }
    await setDoc(doc(firestore, 'cards', newCard.id), newCard);
    await setDoc(doc(firestore, 'qr_codes', newQR.id), newQR);

    // Record activity log
    const adminUser = payload.admin_id || 'admin@panpacificu.edu.ph';
    const log: ActivityLog = {
      id: 'act-' + Date.now(),
      admin_id: adminUser,
      action: 'ADMIN REGISTERED ALUMNI',
      target_type: 'ALUMNI',
      target_id: cleanAlumniId,
      metadata: {
        name: `${newAlumnus.first_name} ${newAlumnus.last_name}`,
        card_number: newCard.card_number,
        qr_value: newQR.qr_value
      },
      created_at: now
    };
    setDoc(doc(firestore, 'activity_logs', log.id), log).catch(() => {});

    return {
      alumnus: newAlumnus,
      alumni_id: newAlumnus.alumni_id,
      academic_records: newAcademicRecords,
      card: newCard,
      qr: newQR
    };
  }

  public async updateAlumnus(
    alumni_id: string,
    payload: {
      first_name?: string;
      middle_name?: string;
      last_name?: string;
      suffix?: string;
      photo_url?: string;
      email?: string;
      phone?: string;
      academic_records?: Omit<AcademicRecord, 'id' | 'alumni_id' | 'created_at' | 'updated_at'>[];
    }
  ) {
    const cleanId = alumni_id.trim();
    const docRef = doc(firestore, 'alumni', cleanId);
    const existing = await getDoc(docRef);
    if (!existing.exists()) throw new Error('Alumnus record not found.');

    const now = new Date().toISOString();
    const updateData: any = { updated_at: now };
    if (payload.first_name !== undefined) updateData.first_name = payload.first_name.trim();
    if (payload.middle_name !== undefined) updateData.middle_name = payload.middle_name.trim();
    if (payload.last_name !== undefined) updateData.last_name = payload.last_name.trim();
    if (payload.suffix !== undefined) updateData.suffix = payload.suffix.trim();
    if (payload.photo_url !== undefined) updateData.photo_url = payload.photo_url;
    if (payload.email !== undefined) updateData.email = payload.email.trim();
    if (payload.phone !== undefined) updateData.phone = payload.phone.trim();

    await updateDoc(docRef, updateData);

    if (payload.academic_records && payload.academic_records.length > 0) {
      // Clean existing records and insert updated
      const existingAcadSnap = await getDocs(
        query(collection(firestore, 'academic_records'), where('alumni_id', '==', cleanId))
      );
      for (const d of existingAcadSnap.docs) {
        await deleteDoc(d.ref);
      }
      for (let i = 0; i < payload.academic_records.length; i++) {
        const ar = payload.academic_records[i];
        const newRecord: AcademicRecord = {
          id: `acad-${Date.now()}-${i}`,
          alumni_id: cleanId,
          degree_level: ar.degree_level,
          degree_program: ar.degree_program.trim(),
          college: ar.college.trim(),
          major: ar.major.trim(),
          graduation_year: ar.graduation_year,
          campus: ar.campus.trim(),
          created_at: now,
          updated_at: now
        };
        await setDoc(doc(firestore, 'academic_records', newRecord.id), newRecord);
      }
    }

    // Log update activity in central audit log
    const log: ActivityLog = {
      id: 'act-' + Date.now(),
      admin_id: 'admin@panpacificu.edu.ph',
      action: 'ADMIN UPDATED ALUMNI PROFILE',
      target_type: 'ALUMNI',
      target_id: cleanId,
      metadata: {
        name: `${existing.data()?.first_name || ''} ${existing.data()?.last_name || ''}`,
        updated_at: now
      },
      created_at: now
    };
    setDoc(doc(firestore, 'activity_logs', log.id), log).catch(() => {});

    return this.getAlumnusDetail(cleanId);
  }

  public async archiveAlumnus(alumni_id: string) {
    const cleanId = alumni_id.trim();
    const docRef = doc(firestore, 'alumni', cleanId);
    const now = new Date().toISOString();
    await updateDoc(docRef, { archived: true, updated_at: now });

    // Log archive activity in central audit log
    const log: ActivityLog = {
      id: 'act-' + Date.now(),
      admin_id: 'admin@panpacificu.edu.ph',
      action: 'ADMIN ARCHIVED ALUMNI RECORD',
      target_type: 'ALUMNI',
      target_id: cleanId,
      created_at: now
    };
    setDoc(doc(firestore, 'activity_logs', log.id), log).catch(() => {});

    return { success: true };
  }

  public async deleteAlumnus(alumni_id: string) {
    const cleanId = alumni_id.trim();
    const docRef = doc(firestore, 'alumni', cleanId);
    await deleteDoc(docRef);

    // Delete associated academic records
    const acadSnap = await getDocs(
      query(collection(firestore, 'academic_records'), where('alumni_id', '==', cleanId))
    );
    for (const d of acadSnap.docs) {
      await deleteDoc(d.ref);
    }

    // Delete associated cards and their QR codes
    const cardsSnap = await getDocs(
      query(collection(firestore, 'cards'), where('alumni_id', '==', cleanId))
    );
    for (const d of cardsSnap.docs) {
      const qSnap = await getDocs(
        query(collection(firestore, 'qr_codes'), where('card_id', '==', d.id))
      );
      for (const qd of qSnap.docs) {
        await deleteDoc(qd.ref);
      }
      await deleteDoc(d.ref);
    }

    // Log deletion activity in central audit log
    const now = new Date().toISOString();
    const log: ActivityLog = {
      id: 'act-' + Date.now(),
      admin_id: 'admin@panpacificu.edu.ph',
      action: 'ADMIN DELETED ALUMNI',
      target_type: 'ALUMNI',
      target_id: cleanId,
      created_at: now
    };
    setDoc(doc(firestore, 'activity_logs', log.id), log).catch(() => {});

    return { success: true };
  }

  // --- REAL-TIME LIVE SYNCHRONIZATION LISTENERS ---
  public subscribeToAlumni(callback: () => void): Unsubscribe {
    return onSnapshot(collection(firestore, 'alumni'), () => {
      callback();
    }, (error) => {
      console.warn('Real-time alumni subscription notice:', error);
    });
  }

  public subscribeToCards(callback: () => void): Unsubscribe {
    return onSnapshot(collection(firestore, 'cards'), () => {
      callback();
    }, (error) => {
      console.warn('Real-time cards subscription notice:', error);
    });
  }

  public subscribeToQRs(callback: () => void): Unsubscribe {
    return onSnapshot(collection(firestore, 'qr_codes'), () => {
      callback();
    }, (error) => {
      console.warn('Real-time QR codes subscription notice:', error);
    });
  }

  public subscribeToVerificationLogs(callback: () => void): Unsubscribe {
    return onSnapshot(collection(firestore, 'verification_logs'), () => {
      callback();
    }, (error) => {
      console.warn('Real-time verification logs subscription notice:', error);
    });
  }

  public subscribeToActivityLogs(callback: () => void): Unsubscribe {
    return onSnapshot(collection(firestore, 'activity_logs'), () => {
      callback();
    }, (error) => {
      console.warn('Real-time activity logs subscription notice:', error);
    });
  }

  // --- CARDS & QR MANAGEMENT ---
  public async getAllCards() {
    const [cardsSnap, alumniSnap, qrSnap] = await Promise.all([
      getDocs(collection(firestore, 'cards')),
      getDocs(collection(firestore, 'alumni')),
      getDocs(collection(firestore, 'qr_codes'))
    ]);

    const cards: AlumniCard[] = cardsSnap.docs.map(d => d.data() as AlumniCard);
    const alumni: Alumni[] = alumniSnap.docs.map(d => d.data() as Alumni);
    const qrs: AlumniQRCode[] = qrSnap.docs.map(d => d.data() as AlumniQRCode);
    const now = new Date();

    const items = cards.map(c => {
      const al = alumni.find(a => a.alumni_id === c.alumni_id);
      const qr = qrs.find(q => q.card_id === c.id);
      let effectiveStatus = c.status;
      if (c.status === 'ACTIVE' && new Date(c.expiration_date) < now) {
        effectiveStatus = 'EXPIRED';
      }
      return {
        ...c,
        effective_status: effectiveStatus,
        alumni_name: al ? `${al.first_name} ${al.last_name}` : 'Unknown Alumnus',
        qr_value: qr?.qr_value || 'None',
        qr_status: qr?.status || 'None'
      };
    });

    return { items, total: items.length };
  }

  public async getAllQRCodes() {
    const [qrSnap, cardsSnap, alumniSnap] = await Promise.all([
      getDocs(collection(firestore, 'qr_codes')),
      getDocs(collection(firestore, 'cards')),
      getDocs(collection(firestore, 'alumni'))
    ]);

    const qrs: AlumniQRCode[] = qrSnap.docs.map(d => d.data() as AlumniQRCode);
    const cards: AlumniCard[] = cardsSnap.docs.map(d => d.data() as AlumniCard);
    const alumni: Alumni[] = alumniSnap.docs.map(d => d.data() as Alumni);

    const items = qrs.map(q => {
      const card = cards.find(c => c.id === q.card_id);
      const al = card ? alumni.find(a => a.alumni_id === card.alumni_id) : null;
      return {
        ...q,
        card_number: card?.card_number || 'N/A',
        card_status: card?.status || 'N/A',
        alumni_id: al?.alumni_id || 'N/A',
        alumni_name: al ? `${al.first_name} ${al.last_name}` : 'N/A'
      };
    });

    return { items, total: items.length };
  }

  public async replaceCard(
    alumni_id: string,
    payload: {
      card_number: string;
      issue_date: string;
      expiration_date: string;
      qr_value: string;
      qr_image_url?: string;
      disable_old_qr?: boolean;
    }
  ) {
    const cleanId = alumni_id.trim();
    const now = new Date().toISOString();

    // Revoke previous cards
    const existingCardsSnap = await getDocs(
      query(collection(firestore, 'cards'), where('alumni_id', '==', cleanId))
    );
    for (const d of existingCardsSnap.docs) {
      await updateDoc(d.ref, {
        status: 'REVOKED',
        revocation_reason: 'Superseded by newly reissued alumni membership card.',
        updated_at: now
      });
      if (payload.disable_old_qr) {
        const qSnap = await getDocs(
          query(collection(firestore, 'qr_codes'), where('card_id', '==', d.id))
        );
        for (const qDoc of qSnap.docs) {
          await updateDoc(qDoc.ref, { status: 'DISABLED', updated_at: now });
        }
      }
    }

    // Create new card and QR
    const newCardId = 'card-' + Date.now();
    const newCard: AlumniCard = {
      id: newCardId,
      alumni_id: cleanId,
      card_number: payload.card_number.trim(),
      issue_date: payload.issue_date,
      expiration_date: payload.expiration_date,
      status: 'ACTIVE',
      created_at: now,
      updated_at: now
    };

    const newQRId = 'qr-' + Date.now();
    const newQR: AlumniQRCode = {
      id: newQRId,
      card_id: newCardId,
      qr_value: payload.qr_value.trim(),
      qr_image_url: payload.qr_image_url || '',
      status: 'ACTIVE',
      uploaded_at: now,
      updated_at: now
    };

    await setDoc(doc(firestore, 'cards', newCard.id), newCard);
    await setDoc(doc(firestore, 'qr_codes', newQR.id), newQR);

    const log: ActivityLog = {
      id: 'act-' + Date.now(),
      admin_id: 'admin@panpacificu.edu.ph',
      action: 'ADMIN REISSUED CARD & QR',
      target_type: 'ALUMNI',
      target_id: cleanId,
      metadata: {
        new_card: newCard.card_number,
        new_qr: newQR.qr_value
      },
      created_at: now
    };
    setDoc(doc(firestore, 'activity_logs', log.id), log).catch(() => {});

    return {
      card: newCard,
      qr: newQR
    };
  }

  public async updateCardStatus(card_id: string, status: CardStatus, revocation_reason?: string) {
    const cardRef = doc(firestore, 'cards', card_id);
    const now = new Date().toISOString();
    await updateDoc(cardRef, {
      status,
      ...(revocation_reason ? { revocation_reason } : {}),
      updated_at: now
    });

    const log: ActivityLog = {
      id: 'act-' + Date.now(),
      admin_id: 'admin@panpacificu.edu.ph',
      action: `ADMIN UPDATED CARD STATUS TO ${status}`,
      target_type: 'CARD',
      target_id: card_id,
      metadata: { status, reason: revocation_reason || '' },
      created_at: now
    };
    setDoc(doc(firestore, 'activity_logs', log.id), log).catch(() => {});

    return { success: true };
  }

  public async updateQRStatus(qr_id: string, status: QRStatus) {
    const qrRef = doc(firestore, 'qr_codes', qr_id);
    const now = new Date().toISOString();
    await updateDoc(qrRef, { status, updated_at: now });

    const log: ActivityLog = {
      id: 'act-' + Date.now(),
      admin_id: 'admin@panpacificu.edu.ph',
      action: `ADMIN UPDATED QR STATUS TO ${status}`,
      target_type: 'QR',
      target_id: qr_id,
      metadata: { status },
      created_at: now
    };
    setDoc(doc(firestore, 'activity_logs', log.id), log).catch(() => {});

    return { success: true };
  }

  // --- STATS & LOGS ---
  public async getStats(): Promise<AdminStats> {
    const [alumniSnap, cardsSnap, qrSnap, logsSnap] = await Promise.all([
      getDocs(collection(firestore, 'alumni')),
      getDocs(collection(firestore, 'cards')),
      getDocs(collection(firestore, 'qr_codes')),
      getDocs(collection(firestore, 'verification_logs'))
    ]);

    const alumni = alumniSnap.docs.map(d => d.data() as Alumni).filter(a => !a.archived);
    const cards = cardsSnap.docs.map(d => d.data() as AlumniCard);
    const qrs = qrSnap.docs.map(d => d.data() as AlumniQRCode);
    const logs = logsSnap.docs.map(d => d.data() as VerificationLog);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    return {
      total_alumni: alumni.length,
      active_cards: cards.filter(c => c.status === 'ACTIVE' && new Date(c.expiration_date) >= now).length,
      expired_cards: cards.filter(c => c.status === 'EXPIRED' || new Date(c.expiration_date) < now).length,
      revoked_cards: cards.filter(c => c.status === 'REVOKED').length,
      registered_qr_codes: qrs.filter(q => q.status === 'ACTIVE').length,
      total_verifications: logs.length,
      today_verifications: logs.filter(l => l.verified_at && l.verified_at.startsWith(todayStr)).length,
      not_found_attempts: logs.filter(l => l.result === 'NOT_FOUND').length
    };
  }

  public async logVerification(log: VerificationLog) {
    const docRef = doc(firestore, 'verification_logs', log.id || 'vlog-' + Date.now());
    await setDoc(docRef, log);
    return log;
  }

  public async getVerificationLogs(params?: { page?: number; limit?: number }) {
    const snap = await getDocs(collection(firestore, 'verification_logs'));
    const logs: VerificationLog[] = snap.docs.map(d => d.data() as VerificationLog);
    logs.sort((a, b) => new Date(b.verified_at).getTime() - new Date(a.verified_at).getTime());

    const page = params?.page || 1;
    const limitCount = params?.limit || 20;
    const startIndex = (page - 1) * limitCount;
    const paginated = logs.slice(startIndex, startIndex + limitCount);

    return {
      items: paginated,
      total: logs.length,
      page,
      limit: limitCount,
      totalPages: Math.ceil(logs.length / limitCount) || 1,
      pagination: { total: logs.length, page, limit: limitCount, totalPages: Math.ceil(logs.length / limitCount) || 1 }
    };
  }

  public async getActivityLogs(params?: { page?: number; limit?: number }) {
    const snap = await getDocs(collection(firestore, 'activity_logs'));
    const logs: ActivityLog[] = snap.docs.map(d => d.data() as ActivityLog);
    logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const page = params?.page || 1;
    const limitCount = params?.limit || 20;
    const startIndex = (page - 1) * limitCount;
    const paginated = logs.slice(startIndex, startIndex + limitCount);

    return {
      items: paginated,
      total: logs.length,
      page,
      limit: limitCount,
      totalPages: Math.ceil(logs.length / limitCount) || 1,
      pagination: { total: logs.length, page, limit: limitCount, totalPages: Math.ceil(logs.length / limitCount) || 1 }
    };
  }

  public async checkUnique(
    type: 'alumni_id' | 'card_number' | 'qr_value',
    value: string,
    currentId?: string
  ): Promise<boolean> {
    const cleanVal = (value || '').trim().toUpperCase();
    if (type === 'alumni_id') {
      const snap = await getDocs(collection(firestore, 'alumni'));
      const found = snap.docs.find(d => {
        const a = d.data() as Alumni;
        return a.alumni_id.toUpperCase() === cleanVal && (!currentId || a.alumni_id !== currentId);
      });
      return !found;
    }
    if (type === 'card_number') {
      const snap = await getDocs(collection(firestore, 'cards'));
      const found = snap.docs.find(d => {
        const c = d.data() as AlumniCard;
        return c.card_number.toUpperCase() === cleanVal && (!currentId || c.id !== currentId);
      });
      return !found;
    }
    if (type === 'qr_value') {
      const snap = await getDocs(collection(firestore, 'qr_codes'));
      const found = snap.docs.find(d => {
        const q = d.data() as AlumniQRCode;
        return q.qr_value.toUpperCase() === cleanVal && (!currentId || q.id !== currentId);
      });
      return !found;
    }
    return true;
  }
}

export const firestoreService = new FirestoreDatabaseService();
