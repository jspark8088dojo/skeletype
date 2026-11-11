// Mesh lists for the regions packed by tools/pack-region.mjs (the foot keeps its own packer).
// [meshKey, BodyParts3D file id, triangle budget]
export const SOURCE_COMMIT = 'f0eeb6e843380cfe6b83797cf8c3e1af74de5e61';
export const SOURCE_BASE = `https://raw.githubusercontent.com/Kevin-Mattheus-Moerman/BodyParts3D/${SOURCE_COMMIT}/assets/BodyParts3D_data/stl`;

export const REGIONS = {
  skull: {
    meshes: [
      ['frontal', 'FMA52734', 5000], ['occipital', 'FMA52735', 5000], ['sphenoid', 'FMA52736', 5000], ['ethmoid', 'FMA52740', 3500],
      ['vomer', 'FMA9710', 1500], ['mandible', 'FMA52748', 5000],
      ['temporal_r', 'FMA52738', 4000], ['temporal_l', 'FMA52739', 4000],
      ['parietal_r', 'FMA52788', 3500], ['parietal_l', 'FMA52789', 3500],
      ['zygomatic_r', 'FMA52892', 2000], ['zygomatic_l', 'FMA52893', 2000],
      ['lacrimal_r', 'FMA53645', 1000], ['lacrimal_l', 'FMA53646', 1000],
      ['nasal_r', 'FMA53647', 1000], ['nasal_l', 'FMA53648', 1000],
      ['maxilla_r', 'FMA53649', 4000], ['maxilla_l', 'FMA53650', 4000],
      ['palatine_r', 'FMA53655', 1800], ['palatine_l', 'FMA53656', 1800],
      ['concha_r', 'FMA54737', 1200], ['concha_l', 'FMA54738', 1200],
    ],
  },
  organs: {
    meshes: [
      ['heart', 'FMA7274', 9000],
      ['lung_ru', 'FMA7333', 3500], ['lung_rm', 'FMA7383', 3000], ['lung_rl', 'FMA7337', 4000],
      ['lung_lu', 'FMA7370', 4000], ['lung_ll', 'FMA7371', 4000],
      ['trachea', 'FMA7394', 2500], ['bronchi', 'FMA7409', 7000], ['esophagus', 'FMA7131', 2000],
      ['aorta_asc', 'FMA3736', 1200], ['aorta_arch', 'FMA3768', 1500], ['aorta_desc', 'FMA3784', 3000],
      ['stomach', 'FMA7148', 4000], ['duodenum', 'FMA7206', 3000], ['jejunum', 'FMA7207', 7000], ['ileum', 'FMA7208', 7000],
      ['appendix', 'FMA14542', 600], ['colon', 'FMA14543nsn', 8000], ['rectum', 'FMA14544', 2500],
      ['liver', 'FMA7197', 6000], ['gallbladder', 'FMA7202', 2000], ['pancreas', 'FMA7198nsn', 3000], ['spleen', 'FMA7196', 3000],
      ['kidney_r', 'FMA7204', 3000], ['kidney_l', 'FMA7205', 3000], ['adrenal_r', 'FMA15629', 1500], ['adrenal_l', 'FMA15630', 1500],
      ['ureter_r', 'FMA15571', 1200], ['ureter_l', 'FMA15572', 1200], ['bladder', 'FMA15900', 2500],
    ],
  },
};
