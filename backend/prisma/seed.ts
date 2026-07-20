/* eslint-disable no-console */
// =============================================================================
//  SGIT-CCTV — Semilla de datos (Aceros Arequipa · Planta Pisco)
//  Carga: permisos, roles, usuario admin, VLANs, jerarquía de planta y
//         activos de ejemplo con topología PMP (anillo -> switch -> NVR ;
//         FortiSwitch -> antena PMP púlpito -> suscriptoras -> cámaras).
// =============================================================================
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// ---- Catálogo de permisos ----
const PERMISSIONS = [
  'user.read', 'user.manage',
  'asset.create', 'asset.read', 'asset.update', 'asset.delete',
  'location.read', 'location.manage',
  'wo.create', 'wo.read', 'wo.update', 'wo.approve',
  'incident.create', 'incident.read', 'incident.update', 'incident.close',
  'document.read', 'document.manage',
  'dashboard.read', 'troubleshooting.read',
  'audit.read',
  'credential.read', 'credential.manage',
];

// ---- Roles y sus permisos ----
const ROLES: Record<string, string[]> = {
  Administrador: PERMISSIONS, // todos
  'Supervisor TI': [
    'user.read', 'asset.create', 'asset.read', 'asset.update', 'location.read', 'location.manage',
    'wo.create', 'wo.read', 'wo.update', 'wo.approve', 'incident.create', 'incident.read',
    'incident.update', 'incident.close', 'document.read', 'document.manage', 'dashboard.read',
    'troubleshooting.read', 'audit.read', 'credential.read', 'credential.manage',
  ],
  'Técnico': [
    'asset.read', 'asset.update', 'location.read', 'wo.create', 'wo.read', 'wo.update',
    'incident.create', 'incident.read', 'incident.update', 'document.read', 'dashboard.read',
    'troubleshooting.read',
  ],
  Consulta: ['asset.read', 'location.read', 'wo.read', 'incident.read', 'document.read', 'dashboard.read'],
};

async function main() {
  console.log('Sembrando SGIT-CCTV (Planta Pisco)...');

  // 1) Permisos
  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  }
  const permMap = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));

  // 2) Roles + asignación de permisos
  const roleIds: Record<string, string> = {};
  for (const [name, perms] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    roleIds[name] = role.id;
    for (const code of perms) {
      const permissionId = permMap.get(code)!;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  // 3) Usuario administrador inicial
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@acerosarequipa.local';
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin.Pisco2026';
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      fullName: 'Administrador SGIT',
      passwordHash: await argon2.hash(adminPass),
      roleId: roleIds['Administrador'],
    },
  });

  // 4) VLANs (arquitectura por Tren)
  const vlans = [
    { number: 10, name: 'Laminación Tren 1', role: 'tren', subnet: '172.16.10.0/24' },
    { number: 20, name: 'Laminación Tren 2', role: 'tren', subnet: '172.16.20.0/24' },
    { number: 30, name: 'Laminación Tren 3', role: 'tren', subnet: '172.16.30.0/24' },
    { number: 100, name: 'NVR / Grabación', role: 'nvr', subnet: '172.16.100.0/24' },
    { number: 200, name: 'Gestión', role: 'gestion', subnet: '172.16.200.0/24' },
  ];
  for (const v of vlans) {
    await prisma.vlan.upsert({ where: { number: v.number }, update: {}, create: v });
  }

  // 5) Jerarquía de ubicaciones: Empresa > Planta > Tren 1/2/3
  const empresa = await prisma.location.upsert({
    where: { code: 'AASA' },
    update: {},
    create: { code: 'AASA', name: 'Aceros Arequipa', type: 'EMPRESA', path: 'AASA' },
  });
  const planta = await prisma.location.upsert({
    where: { code: 'AASA-PISCO' },
    update: {},
    create: { code: 'AASA-PISCO', name: 'Planta Pisco', type: 'PLANTA', parentId: empresa.id, path: 'AASA/PISCO' },
  });
  const trenes: Record<string, string> = {};
  for (const n of [1, 2, 3]) {
    const t = await prisma.location.upsert({
      where: { code: `AASA-PISCO-T${n}` },
      update: {},
      create: {
        code: `AASA-PISCO-T${n}`, name: `Tren ${n} (Laminación)`, type: 'TREN',
        parentId: planta.id, path: `AASA/PISCO/T${n}`,
      },
    });
    trenes[`T${n}`] = t.id;
  }
  // Rack de ejemplo en Tren 1
  const rackT1 = await prisma.location.upsert({
    where: { code: 'AASA-PISCO-T1-R01' },
    update: {},
    create: {
      code: 'AASA-PISCO-T1-R01', name: 'Rack R-01', type: 'RACK',
      parentId: trenes['T1'], path: 'AASA/PISCO/T1/R01',
    },
  });

  // 6) Activos de ejemplo con topología PMP
  //    Switch core (anillo) -> switch distribución -> NVR ; FortiSwitch -> antena PMP -> cámara
  const coreSwitch = await prisma.asset.upsert({
    where: { assetCode: 'AA-SW-T1-CORE-001' },
    update: {},
    create: {
      assetCode: 'AA-SW-T1-CORE-001', type: 'SWITCH', brand: 'Fortinet', model: 'FortiSwitch',
      status: 'OPERATIVO', criticality: 'CRITICA', locationId: rackT1.id,
      switchDev: { create: { portCount: 24, mgmtIp: '172.16.200.2', vendor: 'Fortinet', switchRole: 'CORE_ANILLO' } },
    },
  });
  const nvr = await prisma.asset.upsert({
    where: { assetCode: 'AA-NVR-T1-R01-001' },
    update: {},
    create: {
      assetCode: 'AA-NVR-T1-R01-001', type: 'NVR', brand: 'Hikvision', model: 'DS-96xxNI',
      status: 'OPERATIVO', criticality: 'CRITICA', locationId: rackT1.id,
      nvr: { create: { channels: 64, diskCount: 8, capacityTb: 90, hasLocalDisk: true, nicPrimary: '172.16.100.10', nicSecondary: '10.0.0.10' } },
    },
  });
  const pmp = await prisma.asset.upsert({
    where: { assetCode: 'AA-AP-T1-PUL-001' },
    update: {},
    create: {
      assetCode: 'AA-AP-T1-PUL-001', type: 'WIRELESS', brand: 'Ubiquiti', model: 'airMAX PMP',
      status: 'OPERATIVO', criticality: 'ALTA', locationId: trenes['T1'],
      wireless: { create: { vendor: 'Ubiquiti', frequency: '5 GHz', mode: 'PMP_BASE', originPoint: 'Púlpito T1', linkStable: true } },
    },
  });
  await prisma.asset.upsert({
    where: { assetCode: 'AA-CAM-T1-FX-001' },
    update: {},
    create: {
      assetCode: 'AA-CAM-T1-FX-001', type: 'CAMERA', brand: 'Hikvision', model: 'DS-2CD1143G0-I',
      firmware: 'V5.5.x',
      status: 'OPERATIVO', criticality: 'ALTA', locationId: trenes['T1'],
      camera: { create: { resolution: '2560x1440', ipAddress: '172.16.10.21', nvrId: nvr.id, wirelessUplinkId: pmp.id } },
    },
  });

  // 7) Enlaces de topología (anillo de fibra + uplink)
  const linkExists = await prisma.networkLink.findFirst({ where: { endpointAId: coreSwitch.id, endpointBId: nvr.id } });
  if (!linkExists) {
    await prisma.networkLink.create({
      data: { medium: 'FIBRA', endpointAId: coreSwitch.id, endpointBId: nvr.id, isRing: true, description: 'Core (anillo) → NVR directo' },
    });
  }

  console.log('Semilla completada:');
  console.log(`  Roles: ${Object.keys(ROLES).join(', ')}`);
  console.log(`  Admin: ${adminEmail} / ${adminPass}`);
  console.log('  VLANs: 10, 20, 30, 100, 200');
  console.log('  Ubicaciones: AASA > Pisco > Tren 1/2/3 (+Rack R-01)');
  console.log('  Activos demo: Core Fortinet, NVR Hikvision, Antena PMP púlpito, Cámara T1');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
