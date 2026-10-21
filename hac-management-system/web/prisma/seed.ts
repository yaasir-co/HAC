import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth';

if (process.env.DEMO_MODE !== 'true') throw new Error('Demo seeding requires DEMO_MODE=true. Do not run against production.');
let credentials: Record<string, {email:string,password:string}>;
const now = new Date();
const day = 86_400_000;
const past = (days:number) => new Date(now.getTime() - days * day);
const future = (days:number) => new Date(now.getTime() + days * day);
const ids = {
  keells: 'demo-company-keells', manufacturer: 'demo-company-b', distributor:'demo-company-c',
  admin:'demo-user-admin', supervisor:'demo-user-supervisor',companyUser:'demo-user-company',restricted:'demo-user-restricted',
  location:'demo-location-keells',facility:'demo-location-factory',warehouse:'demo-location-warehouse',
  checklist:'demo-checklist',checklistVersion:'demo-checklist-v1',inspection:'demo-inspection-keells'
};

async function main() {
  credentials = JSON.parse(await readFile('.local/credentials.json', 'utf8'));
  const companies = [
    { id:ids.keells, legalName:'Keells — fictional demonstration', tradingName:'Keells (demo only)',registrationNumber:'DEMO-COMPANY-001',category:'RETAILER', industry:'Retail grocery',email:'keells@example.test' },
    { id:ids.manufacturer, legalName:'Company B — Demo Foods Manufacturing', tradingName:'Company B (demo only)',registrationNumber:'DEMO-COMPANY-002',category:'MANUFACTURER',industry:'Food manufacturing',email:'manufacturing@example.test' },
    { id:ids.distributor, legalName:'Company C — Demo Distribution',tradingName:'Company C (demo only)',registrationNumber:'DEMO-COMPANY-003',category:'DISTRIBUTOR',industry:'Food distribution',email:'distribution@example.test' }
  ];
  for (const company of companies) await db.company.upsert({where:{id:company.id},create:{...company,isDemo:true},update:{}});
  const locations = [
    {id:ids.location,companyId:ids.keells,name:'Colombo demonstration branch',address:'Fictional inspection location, Colombo, Sri Lanka',type:'BRANCH'},
    {id:ids.facility,companyId:ids.manufacturer,name:'Demonstration manufacturing facility',address:'Fictional manufacturing facility, Sri Lanka',type:'FACTORY'},
    {id:ids.warehouse,companyId:ids.distributor,name:'Demonstration distribution warehouse',address:'Fictional warehouse, Sri Lanka',type:'WAREHOUSE'}
  ];
  for (const location of locations) await db.companyLocation.upsert({where:{id:location.id},create:location,update:{}});
  const accounts = [
    {key:'admin',id:ids.admin,name:'HAC Demo Administrator',role:'HAC_ADMIN',companyId:null},
    {key:'supervisor',id:ids.supervisor,name:'Demo Inspection Supervisor',role:'SUPERVISOR',companyId:null},
    {key:'company',id:ids.companyUser,name:'Demo Company Representative',role:'COMPANY_ADMIN',companyId:ids.keells},
    {key:'restricted',id:ids.restricted,name:'Unassigned Demo Supervisor',role:'SUPERVISOR',companyId:null}
  ];
  for (const account of accounts) {
    const credential = credentials[account.key];
    await db.user.upsert({where:{email:credential.email}, create:{id:account.id,email:credential.email,name:account.name,role:account.role,companyId:account.companyId,passwordHash:await hashPassword(credential.password)}, update:{}});
  }
  for (const companyId of [ids.keells,ids.manufacturer]) await db.supervisorCompanyAssignment.upsert({where:{userId_companyId:{userId:ids.supervisor,companyId}},create:{userId:ids.supervisor,companyId},update:{}});
  const brands = [{id:'demo-brand-harvest',name:'Demo Harvest'},{id:'demo-brand-valley',name:'Demo Valley'}];
  for (const brand of brands) await db.brand.upsert({where:{id:brand.id},create:brand,update:{}});
  const manufacturers = [{id:'demo-manufacturer-foods',name:'Company B Demo Foods',country:'Sri Lanka'},{id:'demo-manufacturer-license',name:'Demo License Review Manufacturing',country:'Sri Lanka'}];
  for (const manufacturer of manufacturers) await db.manufacturer.upsert({where:{id:manufacturer.id},create:manufacturer,update:{}});
  await db.supplier.upsert({where:{id:'demo-supplier-distribution'},create:{id:'demo-supplier-distribution',name:'Company C Demo Distribution',email:'distribution@example.test'},update:{}});
  const products = [
    {key:'rice',name:'Demo Harvest White Rice',category:'GRAINS',barcode:'9900000000017',size:'1 kg',description:'Fictional valid manufacturer-held approval; retailer need not be certificate holder.'},
    {key:'tea',name:'Demo Harvest Black Tea',category:'BEVERAGES',barcode:'9900000000024',size:'200 g',description:'Use observed brand Demo Valley to demonstrate a brand mismatch.'},
    {key:'expired-certificate',name:'Demo Harvest Coconut Milk',category:'CANNED_FOOD',barcode:'9900000000031',size:'400 ml',description:'Fictional expired HAC certificate.'},
    {key:'physical-expiry',name:'Demo Harvest Yoghurt',category:'DAIRY',barcode:'9900000000048',size:'100 g',description:'Certificate valid; enter a past physical expiry date to demonstrate independent shelf-life findings.'},
    {key:'variant',name:'Demo Valley Fruit Drink',category:'BEVERAGES',barcode:'9900000000055',size:'250 ml',description:'Only original 250 ml SKU covered; mango 500 ml variant is not covered.'},
    {key:'restricted',name:'Demo Restricted Ingredient',category:'RAW_MATERIAL',barcode:'9900000000062',size:'1 kg',description:'Explicitly simulated restriction record, not a real HAC restriction.'},
    {key:'relationship',name:'Demo Valley Controlled Supply Oil',category:'OILS',barcode:'9900000000079',size:'1 l',description:'Scope requires a company-item relationship which is absent for demo Keells.'},
    {key:'similar-a',name:'Demo Harvest Oat Biscuits Original',category:'BAKERY',barcode:'9900000000086',size:'200 g',description:'Visually similar demonstration class; no artificial recognition scores.'},
    {key:'similar-b',name:'Demo Harvest Oat Biscuits Cocoa',category:'BAKERY',barcode:'9900000000093',size:'200 g',description:'Visually similar demonstration class; collect independent real packaging images for training.'},
    {key:'license',name:'Demo License Review Flour',category:'RAW_MATERIAL',barcode:'9900000000109',size:'1 kg',description:'Separate commercial manufacturing license is expired.'},
    {key:'renewed',name:'Demo Harvest Renewed Lentils',category:'GRAINS',barcode:'9900000000116',size:'500 g',description:'Expired certificate is superseded by a valid replacement.'}
  ];
  for (let i=0;i<products.length;i++) {
    const product=products[i]; const productId=`demo-product-${product.key}`;
    await db.product.upsert({where:{id:productId},create:{id:productId,itemCode:`DEMO-ITEM-${String(i+1).padStart(3,'0')}`,name:product.name,normalizedName:product.name.toLowerCase(),type:['restricted','license'].includes(product.key)?'RAW_MATERIAL':'PRODUCT',category:product.category,brandId:product.key==='variant'||product.key==='relationship'?brands[1].id:brands[0].id,manufacturerId:product.key==='license'?manufacturers[1].id:manufacturers[0].id,supplierId:'demo-supplier-distribution',origin:'Sri Lanka',description:product.description,status:'ACTIVE',isDemo:true},update:{}});
    await db.productVariant.upsert({where:{id:`demo-variant-${product.key}`},create:{id:`demo-variant-${product.key}`,productId,name:'Original',sku:`DEMO-SKU-${product.key.toUpperCase()}`,barcode:product.barcode,packageSize:product.size,packaging:'Fictional demonstration packaging'},update:{}});
    if (product.key!=='relationship') await db.companyItem.upsert({where:{companyId_productId:{companyId:ids.keells,productId}},create:{companyId:ids.keells,productId,relationship:'RETAILER',effectiveAt:past(365)},update:{}});
  }
  await db.productVariant.upsert({where:{id:'demo-variant-mango'},create:{id:'demo-variant-mango',productId:'demo-product-variant',name:'Mango',sku:'DEMO-SKU-MANGO-500',barcode:'9900000000123',packageSize:'500 ml',flavour:'Mango'},update:{}});
  const certificates = [
    {id:'demo-certificate-valid',number:'FICTIONAL-HAC-2026-001',status:'ACTIVE',effectiveAt:past(180),expiresAt:future(180)},
    {id:'demo-certificate-expired',number:'FICTIONAL-HAC-EXPIRED-002',status:'ACTIVE',effectiveAt:past(400),expiresAt:past(30)},
    {id:'demo-certificate-renewed-old',number:'FICTIONAL-HAC-RENEWAL-OLD',status:'SUPERSEDED',effectiveAt:past(400),expiresAt:past(5)},
    {id:'demo-certificate-renewed-new',number:'FICTIONAL-HAC-RENEWAL-NEW',status:'ACTIVE',effectiveAt:past(6),expiresAt:future(359),supersedesId:'demo-certificate-renewed-old'}
  ];
  for (const certificate of certificates) {
    await db.certificate.upsert({where:{id:certificate.id},create:{...certificate,holderId:ids.manufacturer,issuer:'Fictional HAC Demonstration Authority — NOT AN OFFICIAL CERTIFICATE',type:'HAC',issuedAt:certificate.effectiveAt,isDemo:true},update:{}});
    const historyId=`${certificate.id}-history`;
    await db.certificateHistory.upsert({where:{id:historyId},create:{id:historyId,certificateId:certificate.id,status:certificate.status,effectiveAt:certificate.effectiveAt,reason:'Isolated fictional development seed',createdById:ids.admin},update:{}});
  }
  for (const product of products) {
    const certIds=product.key==='renewed'?['demo-certificate-renewed-old','demo-certificate-renewed-new']:[product.key==='expired-certificate'?'demo-certificate-expired':'demo-certificate-valid'];
    for (const certificateId of certIds) await db.certificateScope.upsert({where:{id:`demo-scope-${product.key}-${certificateId}`},create:{id:`demo-scope-${product.key}-${certificateId}`,certificateId,productId:`demo-product-${product.key}`,variantId:`demo-variant-${product.key}`,requiresCompanyRelationship:product.key==='relationship',description:'FICTIONAL DEVELOPMENT APPROVAL. Covers the exact listed product SKU only.'},update:{}});
  }
  await db.restrictionRecord.upsert({where:{reference:'FICTIONAL-RESTRICTION-001'},create:{id:'demo-restriction',productId:'demo-product-restricted',authority:'Simulated Demo Authority — NOT AN OFFICIAL BAN',reference:'FICTIONAL-RESTRICTION-001',reason:'Simulated restricted ingredient for testing the explicit restriction workflow.',scope:'Demonstration product only',status:'ACTIVE',effectiveAt:past(30),createdById:ids.admin},update:{}});
  await db.license.upsert({where:{number:'FICTIONAL-COMMERCIAL-LICENSE-001'},create:{id:'demo-license-expired',manufacturerId:'demo-manufacturer-license',name:'Fictional commercial manufacturing license',number:'FICTIONAL-COMMERCIAL-LICENSE-001',authority:'Demo Commercial Licensing Authority',status:'ACTIVE',effectiveAt:past(400),expiresAt:past(7),required:true},update:{}});
  await db.checklistTemplate.upsert({where:{id:ids.checklist},create:{id:ids.checklist,name:'HAC demonstration site inspection',description:'Development checklist, pending formal HAC policy approval.'},update:{}});
  await db.checklistTemplateVersion.upsert({where:{id:ids.checklistVersion},create:{id:ids.checklistVersion,templateId:ids.checklist,version:1,status:'PUBLISHED',publishedAt:past(30)},update:{}});
  const questions = [
    {id:'demo-question-storage',section:'Storage and handling',text:'Are food products stored under the required conditions?',type:'COMPLIANCE'},
    {id:'demo-question-segregation',section:'Storage and handling',text:'Is segregation maintained for materials requiring separate handling?',type:'COMPLIANCE'},
    {id:'demo-question-traceability',section:'Traceability',text:'Can the site trace the sampled products to suppliers and batches?',type:'COMPLIANCE'},
    {id:'demo-question-notes',section:'Inspector notes',text:'Record additional inspection observations.',type:'TEXT',required:false}
  ];
  for(let i=0;i<questions.length;i++) await db.checklistQuestion.upsert({where:{id:questions[i].id},create:{...questions[i],versionId:ids.checklistVersion,order:i,required:questions[i].required??true,options:questions[i].type==='COMPLIANCE'?['COMPLIANT','NON_COMPLIANT','NOT_APPLICABLE']:undefined},update:{}});
  await db.inspection.upsert({where:{id:ids.inspection},create:{id:ids.inspection,reference:'DEMO-INS-KEELLS-001',companyId:ids.keells,locationId:ids.location,inspectorId:ids.supervisor,scheduledAt:now,checklistVersionId:ids.checklistVersion,type:'ROUTINE',status:'SCHEDULED',objectives:'Fictional end-to-end demonstration. These records do not assert any real company or product HAC approval.',isDemo:true},update:{}});
  for (const userId of [ids.admin,ids.supervisor]) await db.notification.upsert({where:{dedupeKey:`demo-welcome-${userId}`},create:{userId,dedupeKey:`demo-welcome-${userId}`,title:'Fictional demonstration workspace',message:'All seeded companies, approvals, certificates and restrictions are fictional development data. No model has been trained or published.',href:'/inspections'},update:{}});
  console.log('Seed complete: 3 fictional companies, 11 products, exact approval scopes, demo inspection and isolated demo users. Existing records preserved. Login credentials: .local/credentials.json (private).');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
