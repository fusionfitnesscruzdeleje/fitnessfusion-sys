import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import ProgressChart from './ProgressChart';
import WhatsAppIcon from './WhatsAppIcon';

export default function MemberModal({ member, plans, API_URL, onSave, onClose }: any) {
  const [activeTab, setActiveTab] = useState<'datos' | 'entrenamiento' | 'progreso'>('datos');
  const [formData, setFormData] = useState(member);
  
  // Entrenamiento State
  const [routine, setRoutine] = useState<any[]>(member?.routine || []);
  const [progressData, setProgressData] = useState<any>(null);
  const [chartFilter, setChartFilter] = useState<'7d'|'30d'|'all'>('all');
  const [exercises, setExercises] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSegment, setSelectedSegment] = useState<string>('Todos');
  const [selectedZone, setSelectedZone] = useState<string>('Todas');

  const segments = ['Todos', 'Tren superior', 'Tren medio / core', 'Tren inferior', 'Cuerpo completo'];
  const availableZones = selectedSegment === 'Todos' ? [] : Array.from(new Set(exercises.filter((e:any) => e.segment === selectedSegment).map((e:any) => e.zone)));

  useEffect(() => {
    setSelectedZone('Todas');
  }, [selectedSegment]);

  
  const [newClassMode, setNewClassMode] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [selectedClassIndex, setSelectedClassIndex] = useState<number>(0);

  useEffect(() => {
    fetch(`${API_URL}/admin/exercises`)
      .then(r => r.json())
      .then(data => setExercises(data))
      .catch(e => console.error(e));
      
    if (member?.dni) {
      fetch(`${API_URL}/user/${member.dni}/progress`)
        .then(r => r.json())
        .then(data => setProgressData(data))
        .catch(e => console.error("Error fetching progress", e));
    }
  }, [API_URL, member]);

  const handleAddClass = () => {
    if(!newClassName) return;
    setRoutine([...routine, { class_name: newClassName, exercises: [] }]);
    setNewClassName('');
    setNewClassMode(false);
    setSelectedClassIndex(routine.length);
  };

  const handleAddExercise = (ex: any) => {
    const updated = [...routine];
    if(!updated[selectedClassIndex]) return;
    updated[selectedClassIndex].exercises.push({
      exercise_id: ex.id,
      name: ex.name,
      sets: 4,
      reps: 10,
      kg: 0,
      coach_notes: ''
    });
    setRoutine(updated);
  };

  const handleUpdateExercise = (cIdx: number, eIdx: number, field: string, value: any) => {
    const updated = [...routine];
    updated[cIdx].exercises[eIdx][field] = value;
    setRoutine(updated);
  };

  const handleRemoveExercise = (cIdx: number, eIdx: number) => {
    const updated = [...routine];
    updated[cIdx].exercises.splice(eIdx, 1);
    setRoutine(updated);
  };

  const handleSaveInternal = () => {
    onSave({ ...formData, routine });
  };

  const filteredExercises = exercises.filter((e:any) => {
    const matchSearch = e.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                       (e.muscle_group && e.muscle_group.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchSegment = selectedSegment === 'Todos' || e.segment === selectedSegment;
    const matchZone = selectedZone === 'Todas' || e.zone === selectedZone;
    return matchSearch && matchSegment && matchZone;
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-white/10 p-8 rounded-[40px] w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
        
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-black dark:text-white uppercase tracking-widest">
            {member.id ? 'Editar Socio' : 'Nuevo Socio'}
          </h2>
          <button onClick={onClose}><X size={24} className="text-gray-400 hover:text-black dark:hover:text-white transition-colors" /></button>
        </div>

        <div className="flex gap-4 mb-6 border-b border-gray-200 dark:border-white/10 pb-2">
          <button onClick={() => setActiveTab('datos')} className={`text-[10px] font-black uppercase tracking-widest pb-2 ${activeTab === 'datos' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500 hover:text-black dark:hover:text-white'}`}>Datos Personales</button>
          <button onClick={() => setActiveTab('entrenamiento')} className={`text-[10px] font-black uppercase tracking-widest pb-2 ${activeTab === 'entrenamiento' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500 hover:text-black dark:hover:text-white'}`}>Entrenamiento</button>
          <button onClick={() => setActiveTab('progreso')} className={`text-[10px] font-black uppercase tracking-widest pb-2 ${activeTab === 'progreso' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500 hover:text-black dark:hover:text-white'}`}>Progreso</button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {activeTab === 'datos' && (
            <div className="space-y-4 w-full">
              <div className="grid grid-cols-2 gap-4">
                 <input type="text" placeholder="Nombre Completo" className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-4 text-black dark:text-white text-xs" value={formData?.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                 <input type="text" placeholder="DNI" className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-4 text-black dark:text-white text-xs" value={formData?.dni || ''} onChange={e => setFormData({...formData, dni: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="relative flex items-center">
                    <span className="absolute left-3.5 text-green-500 pointer-events-none">
                      <WhatsAppIcon size={16} className="fill-green-500" />
                    </span>
                    <input 
                      type="text" 
                      placeholder="WhatsApp / Celular" 
                      className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-4 pl-10 pr-20 text-black dark:text-white text-xs" 
                      value={formData?.phone || ''} 
                      onChange={e => setFormData({...formData, phone: e.target.value})} 
                    />
                    {formData?.phone && (
                      <a
                        href={`https://wa.me/${formData.phone.replace(/\D/g, '').startsWith('54') ? formData.phone.replace(/\D/g, '') : '549' + formData.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Chatear por WhatsApp con ${formData.name || 'Socio'}`}
                        className="absolute right-3 px-2.5 py-1.5 bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <WhatsAppIcon size={12} className="fill-current" />
                        <span>Chat</span>
                      </a>
                    )}
                 </div>
                 <input type="email" placeholder="Correo Electrónico" className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-4 text-black dark:text-white text-xs" value={formData?.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-gray-500 dark:text-white/20 uppercase font-black ml-2">Plan Principal</label>
                <select className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-4 text-black dark:text-white text-xs font-bold uppercase" value={formData?.membership_type || plans[0]?.name || ''} onChange={e => setFormData({...formData, membership_type: e.target.value})}>
                   {plans.map((p:any) => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>

              <div className="space-y-2 mt-4 p-4 bg-gray-50 dark:bg-black/20 rounded-2xl border border-gray-200 dark:border-white/10">
                <label className="text-[10px] text-orange-500 font-black uppercase tracking-wider block">
                  Planes Adicionales (Unificables)
                </label>
                <p className="text-[9px] text-gray-400 dark:text-white/40 mb-2">
                  Seleccioná los planes complementarios que se sumarán al cobro y tendrán asistencias separadas:
                </p>
                {plans.filter((p: any) => p.allow_unification).length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {plans.filter((p: any) => p.allow_unification).map((p: any) => {
                      const currentAdd = formData?.additional_plans || [];
                      const isChecked = currentAdd.includes(p.name);
                      return (
                        <label key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isChecked ? 'bg-orange-500/10 border-orange-500/50 text-orange-400 font-bold' : 'bg-white/5 border-white/5 text-gray-400'}`}>
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, additional_plans: [...currentAdd, p.name] });
                              } else {
                                setFormData({ ...formData, additional_plans: currentAdd.filter((n: string) => n !== p.name) });
                              }
                            }}
                            className="rounded text-orange-500 focus:ring-orange-500"
                          />
                          <div className="text-xs">
                            <p className="font-black uppercase">{p.name}</p>
                            <p className="text-[10px] opacity-70">${p.price?.toLocaleString()} — {p.days_per_week} d/sem</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No hay planes marcados con "Permitir unificación con otros planes".</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[9px] text-gray-500 dark:text-white/20 uppercase font-black ml-2">Fecha de Inicio del Plan</label>
                <input type="date" className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-4 text-black dark:text-white text-xs" value={formData?.joined_at ? formData.joined_at.split('T')[0] : ''} onChange={e => setFormData({...formData, joined_at: e.target.value ? e.target.value + 'T00:00:00' : null})} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-gray-500 dark:text-white/20 uppercase font-black ml-2">Contraseña de Acceso</label>
                <input type="text" placeholder="Asignar Contraseña" className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-4 text-black dark:text-white text-xs" value={formData?.password || ''} onChange={e => setFormData({...formData, password: e.target.value})} />
              </div>
            </div>
          )}

          {activeTab === 'progreso' && (
            <div className="w-full h-full flex flex-col gap-6">
              {(() => {
                let filteredEvolution: any[] = progressData?.chart_data || [];
                if (chartFilter === '7d') {
                  const limitDate = new Date();
                  limitDate.setDate(limitDate.getDate() - 7);
                  filteredEvolution = filteredEvolution.filter((e:any) => new Date(e.date) >= limitDate);
                } else if (chartFilter === '30d') {
                  const limitDate = new Date();
                  limitDate.setDate(limitDate.getDate() - 30);
                  filteredEvolution = filteredEvolution.filter((e:any) => new Date(e.date) >= limitDate);
                }

                let totalImprovement = 0;
                let daysTrained = filteredEvolution.length;
                if (filteredEvolution.length > 1) {
                  const first = filteredEvolution[0];
                  const last = filteredEvolution[filteredEvolution.length - 1];
                  let firstTotal = 0; let lastTotal = 0;
                  Object.keys(first).forEach(k => { if (k !== 'date' && typeof first[k] === 'number') firstTotal += first[k]; });
                  Object.keys(last).forEach(k => { if (k !== 'date' && typeof last[k] === 'number') lastTotal += last[k]; });
                  if (firstTotal > 0) totalImprovement = Math.round(((lastTotal - firstTotal) / firstTotal) * 100);
                }

                return (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-4 flex flex-col justify-center items-center relative overflow-hidden">
                         <p className="text-[10px] font-black uppercase text-gray-500 dark:text-white/40 tracking-widest mb-1">Mejoría Total</p>
                         <p className="text-3xl font-black text-black dark:text-white flex items-baseline gap-1">
                           {totalImprovement > 0 ? `+${totalImprovement}%` : `${totalImprovement}%`}
                         </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-4 flex flex-col justify-center items-center relative overflow-hidden">
                         <p className="text-[10px] font-black uppercase text-gray-500 dark:text-white/40 tracking-widest mb-1">Días Entrenados</p>
                         <p className="text-3xl font-black text-black dark:text-white">{daysTrained}</p>
                      </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-3xl border border-gray-200 dark:border-white/10 flex flex-col min-h-[300px]">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-black uppercase text-black dark:text-white">Gráfico de Cargas</h3>
                        <div className="flex gap-2">
                          <button onClick={() => setChartFilter('7d')} className={`px-2 py-1 rounded text-[8px] font-black uppercase transition-colors ${chartFilter === '7d' ? 'bg-orange-500 text-white' : 'bg-white/10 text-gray-500 dark:text-white/40'}`}>7 Días</button>
                          <button onClick={() => setChartFilter('30d')} className={`px-2 py-1 rounded text-[8px] font-black uppercase transition-colors ${chartFilter === '30d' ? 'bg-orange-500 text-white' : 'bg-white/10 text-gray-500 dark:text-white/40'}`}>30 Días</button>
                          <button onClick={() => setChartFilter('all')} className={`px-2 py-1 rounded text-[8px] font-black uppercase transition-colors ${chartFilter === 'all' ? 'bg-orange-500 text-white' : 'bg-white/10 text-gray-500 dark:text-white/40'}`}>Histórico</button>
                        </div>
                      </div>
                      <ProgressChart data={filteredEvolution} />
                    </div>
                  </>
                );
              })()}
              
              {progressData?.uncompleted_history && progressData.uncompleted_history.length > 0 && (
                <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-3xl">
                  <h3 className="text-sm font-black uppercase mb-4 text-orange-500">Historial de Incompletos</h3>
                  <div className="space-y-2">
                    {progressData.uncompleted_history.map((uh: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5">
                        <div>
                          <p className="text-xs font-bold text-white">{uh.exercise}</p>
                          <p className="text-[10px] text-white/50">{new Date(uh.date).toLocaleDateString()}</p>
                        </div>
                        <p className="text-xs font-bold text-orange-400 italic">"{uh.reason}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {activeTab === 'entrenamiento' && (
            <div className="flex flex-col md:flex-row gap-6 h-full">
              {/* Creador de Rutinas */}
              <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase text-gray-400">Días de Entrenamiento</h3>
                  {!newClassMode ? (
                    <button onClick={() => setNewClassMode(true)} className="text-[9px] bg-white/10 text-white px-2 py-1 rounded-md font-bold">+ Agregar Día</button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input type="text" autoFocus placeholder="Ej: Día 1..." className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-white" value={newClassName} onChange={e=>setNewClassName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddClass()} />
                      <button onClick={handleAddClass} className="text-[9px] bg-orange-500 text-black px-2 py-1 rounded-md font-bold">OK</button>
                      <button onClick={() => setNewClassMode(false)} className="text-[9px] text-red-500 font-bold">X</button>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2">
                  {routine.map((c, idx) => (
                    <button key={idx} onClick={() => setSelectedClassIndex(idx)} className={`whitespace-nowrap px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-colors ${selectedClassIndex === idx ? 'bg-orange-500 text-black' : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40 hover:bg-gray-200 dark:hover:bg-white/10'}`}>
                      {c.class_name}
                    </button>
                  ))}
                  {routine.length === 0 && <p className="text-[9px] text-gray-500">No hay días creados. Agrega un día para comenzar.</p>}
                </div>

                {routine.length > 0 && routine[selectedClassIndex] && (
                  <div className="space-y-2 mt-4 bg-gray-50 dark:bg-white/5 p-4 rounded-2xl border border-gray-200 dark:border-white/10">
                    <h4 className="text-[10px] font-black uppercase text-black dark:text-white mb-2">Ejercicios - {routine[selectedClassIndex].class_name}</h4>
                    {routine[selectedClassIndex].exercises.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No hay ejercicios asignados.</p>
                    ) : (
                      routine[selectedClassIndex].exercises.map((ex: any, eIdx: number) => (
                        <div key={eIdx} className="flex flex-col gap-2 bg-white dark:bg-black/40 p-3 rounded-xl border border-gray-200 dark:border-white/10">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-xs font-bold text-black dark:text-white truncate flex-1">{ex.name}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <input type="number" value={ex.sets} onChange={(e) => handleUpdateExercise(selectedClassIndex, eIdx, 'sets', parseInt(e.target.value))} className="w-12 bg-gray-100 dark:bg-white/10 border-none rounded-md text-xs text-center py-1 font-bold text-black dark:text-white" title="Sets" />
                              <span className="text-[10px] text-gray-400">x</span>
                              <input type="number" value={ex.reps} onChange={(e) => handleUpdateExercise(selectedClassIndex, eIdx, 'reps', parseInt(e.target.value))} className="w-12 bg-gray-100 dark:bg-white/10 border-none rounded-md text-xs text-center py-1 font-bold text-black dark:text-white" title="Reps" />
                              <span className="text-[10px] text-gray-400">|</span>
                              <span className="text-xs text-orange-500 font-bold">{ex.kg || 0}kg</span>
                              <button onClick={() => handleRemoveExercise(selectedClassIndex, eIdx)} className="text-red-500 ml-2"><X size={14} /></button>
                            </div>
                          </div>
                          <input type="text" placeholder="Instrucciones del entrenador para este ejercicio..." value={ex.coach_notes || ''} onChange={(e) => handleUpdateExercise(selectedClassIndex, eIdx, 'coach_notes', e.target.value)} className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-2 text-[10px] text-black dark:text-white italic outline-none focus:border-orange-500/50" />
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Buscador de Ejercicios */}
              {routine.length > 0 && (
                <div className="w-full md:w-64 flex flex-col border-t md:border-t-0 md:border-l border-gray-200 dark:border-white/10 pt-4 md:pt-0 md:pl-6">
                  <h3 className="text-xs font-black uppercase text-gray-400 mb-2">Agregar Ejercicio</h3>
                  <input type="text" placeholder="Buscar..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-2 text-[10px] text-black dark:text-white mb-2" />
                  
                  <div className="flex flex-wrap gap-1 mb-2">
                    {segments.map(seg => (
                      <button key={seg} onClick={() => setSelectedSegment(seg)} className={`px-2 py-1 rounded-md text-[8px] font-black uppercase transition-all ${selectedSegment === seg ? 'bg-orange-500 text-black' : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40 hover:bg-gray-200'}`}>
                        {seg}
                      </button>
                    ))}
                  </div>

                  {selectedSegment !== 'Todos' && availableZones.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      <button onClick={() => setSelectedZone('Todas')} className={`px-2 py-1 rounded-md text-[8px] font-bold uppercase transition-all ${selectedZone === 'Todas' ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40 hover:bg-gray-200'}`}>
                        Todas las Zonas
                      </button>
                      {availableZones.map((z: any) => (
                        <button key={z} onClick={() => setSelectedZone(z)} className={`px-2 py-1 rounded-md text-[8px] font-bold uppercase transition-all ${selectedZone === z ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40 hover:bg-gray-200'}`}>
                          {z}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex-1 overflow-y-auto space-y-2 max-h-64 custom-scrollbar pr-1">
                    {filteredExercises.map(ex => (
                      <button key={ex.id} onClick={() => handleAddExercise(ex)} className="w-full text-left bg-gray-50 dark:bg-white/5 hover:bg-orange-500/10 p-2 rounded-lg border border-transparent hover:border-orange-500/30 transition-colors group">
                        <div className="text-[10px] font-bold text-black dark:text-white group-hover:text-orange-500">{ex.name}</div>
                        <div className="text-[8px] text-gray-400">{ex.muscle_group}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 pt-4 border-t border-gray-200 dark:border-white/10 flex justify-end gap-4 shrink-0">
          <button onClick={onClose} className="px-6 py-3 rounded-xl text-xs font-black uppercase text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">Cancelar</button>
          <button onClick={handleSaveInternal} className="px-8 py-3 bg-orange-500 text-black rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-orange-600 transition-colors flex items-center gap-2">
            <Save size={16} /> Guardar Socio
          </button>
        </div>
        
      </div>
    </div>
  );
}
