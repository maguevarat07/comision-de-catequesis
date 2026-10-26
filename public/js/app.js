/* Interacciones del prototipo. No se envían ni guardan datos. */
window.createCatequesisComponent = function (DCLogic) {
class Component extends DCLogic {
  state = { zone: -1, hito: 0, rev: 0, open: -1, step: 0, sub: 0, ag: -1, interes: 0, nombre: '', parroquia: '', contacto: '', mensaje: '', sent: false };

  renderVals() {
    const s = this.state;
    const gold = this.props.accent ?? '#F0B544';

    const stepsData = [
      { title: 'Escucha el llamado', body: 'Todo catequista empieza con una inquietud: ¿quién acompaña a los niños, jóvenes y familias de mi comunidad? Si esa pregunta te ronda, ya diste el primer paso. Habla con tu párroco y acércate a la Comisión.', offer: 'Orientación para discernir cómo servir en tu parroquia.', cta: 'Pedir orientación' },
      { title: 'Fórmate', body: 'La Comisión ofrece formación para catequistas: metodología, diseño de proyectos y aplicación práctica, además de espacios permanentes de actualización pedagógica y espiritual.', offer: 'Talleres, materiales y formación permanente para catequistas.', cta: 'Quiero formarme' },
      { title: 'Sé enviado', body: 'Al inicio del año pastoral, la comunidad celebra la Eucaristía de envío: los catequistas son enviados como misioneros a sus parroquias, con el respaldo de toda la Arquidiócesis.', offer: 'Una celebración de envío y el acompañamiento de tu vicaría.', cta: 'Quiero ser enviado' },
      { title: 'Acompaña y celebra', body: 'Los catequistas no caminan solos: se reúnen con la Comisión y las vicarías para coordinar, compartir experiencias y celebrar su vocación en el Día del Catequista.', offer: 'Reuniones de coordinación, reconocimiento y comunidad.', cta: 'Quiero sumarme' }
    ];
    const steps = stepsData.map((d, i) => {
      const active = s.step === i; const done = s.step >= i;
      return {
        n: i + 1, title: d.title, body: d.body, offer: d.offer, cta: d.cta, active,
        pick: () => this.setState({ step: i }),
        btnStyle: 'background:none;border:0;cursor:pointer;color:#F2F5FB;font:inherit;display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:0 4px 0 0;min-height:44px;opacity:' + (active ? 1 : 0.72),
        dotStyle: 'width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px;font-family:Fraunces,Georgia,serif;transition:all .4s;border:3px solid ' + gold + ';background:' + (done ? gold : '#0E1B3D') + ';color:' + (done ? '#0E1B3D' : gold) + ';transform:scale(' + (active ? 1.12 : 1) + ')'
      };
    });
    const progress = 'calc((100% - 56px) * ' + (s.step / 3) + ')';

    const svcData = [
      ['Formación de catequistas', 'Metodología, diseño de proyectos y aplicación práctica para renovar la forma de catequizar en cada parroquia.', 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5'],
      ['Catequesis específicas', 'Propuestas para familias, personas con necesidades especiales, adultos y jóvenes.', 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.9M16 4.2a3.5 3.5 0 0 1 0 6.6'],
      ['Encuentro y comunión', 'Reuniones mensuales de coordinación con las vicarías para caminar en una misma dirección.', 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1'],
      ['Envío misionero', 'Eucaristía de envío al inicio del año pastoral para los catequistas de toda la Arquidiócesis.', 'M22 2 11 13M22 2l-7 20-4-9-9-4z'],
      ['Celebración y reconocimiento', 'Día del Catequista y reconocimiento a quienes llevan años sirviendo a sus comunidades.', 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
      ['Cuidado de la casa común', 'Iniciativas que unen fe y creación, como un concurso de nacimientos con materiales reciclables.', 'M11 20A7 7 0 0 1 4 13c0-6 6-10 16-10 0 10-4 17-9 17zM4 21c3-6 6-9 11-12']
    ];
    const services = svcData.map(d => ({ title: d[0], text: d[1], icon: d[2], style: 'background:#fff;border:1px solid #D6DDEC;border-radius:22px;padding:32px' }));

    const subData = [
      ['Familiar', 'Acompaña a las familias como primera escuela de fe: padres y madres redescubren su papel en la transmisión de la fe en casa.'],
      ['Especial', 'Una catequesis que se adapta a cada persona, para que nadie quede fuera del encuentro con Jesús y con la comunidad.'],
      ['De adultos', 'Un camino para quienes quieren retomar, profundizar o iniciar su vida de fe en la madurez.'],
      ['De jóvenes', 'Espacios de encuentro, Palabra y misión pensados para que los jóvenes vivan y compartan su fe.']
    ];
    const subs = subData.map((d, i) => ({
      label: d[0], active: s.sub === i,
      pick: () => this.setState({ sub: i }),
      style: 'padding:12px 24px;border-radius:99px;font:inherit;font-weight:700;cursor:pointer;min-height:44px;transition:all .3s;border:2px solid ' + gold + ';background:' + (s.sub === i ? gold : 'transparent') + ';color:' + (s.sub === i ? '#0E1B3D' : '#F2F5FB')
    }));

    const agData = [
      ['Formación', 'Taller de formación para catequistas', 'Metodología, diseño de proyectos y práctica para renovar la catequesis en las parroquias.'],
      ['Celebración', 'Eucaristía de envío', 'Celebración al inicio del año pastoral en la que los catequistas son enviados a sus comunidades.'],
      ['Coordinación', 'Reunión mensual con las vicarías', 'Espacio de encuentro y comunión para coordinar y compartir experiencias.'],
      ['Celebración', 'Día del Catequista', 'Una fiesta para agradecer y reconocer la vocación de quienes catequizan.'],
      ['Casa común', 'Concurso de nacimientos', 'Nacimientos elaborados con materiales reciclables, para cuidar la creación en Navidad.']
    ];
    const agenda = agData.map((d, i) => {
      const open = s.ag === i;
      return {
        type: d[0], title: d[1], detail: d[2], date: 'Por confirmar', place: 'Por confirmar', open,
        toggle: () => this.setState({ ag: open ? -1 : i }),
        plusStyle: 'display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#0E1B3D;color:#F2F5FB;font-size:22px;transition:transform .35s;transform:rotate(' + (open ? 135 : 0) + 'deg)',
        detailStyle: 'overflow:hidden;transition:max-height .45s ease,opacity .45s;max-height:' + (open ? '220px' : '0') + ';opacity:' + (open ? 1 : 0)
      };
    });

    const intData = ['Quiero empezar como catequista', 'Ya soy catequista', 'Coordino la catequesis de mi parroquia'];
    const intereses = intData.map((l, i) => ({
      label: l, active: s.interes === i,
      pick: () => this.setState({ interes: i }),
      style: 'padding:10px 16px;border-radius:99px;font:inherit;font-size:15px;font-weight:700;cursor:pointer;min-height:44px;border:2px solid #0E1B3D;background:' + (s.interes === i ? '#0E1B3D' : 'transparent') + ';color:' + (s.interes === i ? '#F2F5FB' : '#0E1B3D')
    }));

    const cardData = [
      ['Más que sacramentos', 'La catequesis es un camino de crecimiento y maduración en la fe. Integra la Palabra de Dios, la liturgia, la vida comunitaria, la oración y el compromiso cristiano.'],
      ['La familia primero', 'La familia es la primera escuela de fe. El catequista no reemplaza a los padres: camina con ellos y fortalece lo que ya se vive en casa.'],
      ['Palabra, fe y vida', 'Cada encuentro parte de la Palabra viva de Dios y desemboca en celebración, comunidad y testimonio en las parroquias de Panamá.']
    ];
    const cards = cardData.map((d, i) => {
      const revealed = s.rev > i; const avail = s.rev === i; const locked = s.rev < i;
      return {
        n: i + 1, title: d[0], locked,
        aria: locked ? 'Carta ' + (i + 1) + ' bloqueada. Descubre la anterior primero.' : (revealed ? 'Leer de nuevo: ' + d[0] : 'Descubrir la carta ' + (i + 1)),
        cls: avail ? 'card cta' : (revealed ? 'card' : ''),
        pick: () => this.setState({ open: i }),
        hint: locked ? 'Bloqueada. Descubre la anterior primero' : 'Toca para descubrir',
        hintStyle: 'font-size:15px;font-weight:700;padding:8px 16px;border-radius:99px;' + (locked ? 'color:#B9C4DC;border:1px dashed rgba(185,196,220,.6)' : 'background:#F0B544;color:#0E1B3D'),
        btnStyle: 'position:relative;height:300px;border:0;padding:0;background:none;border-radius:22px;perspective:1000px;font:inherit;color:inherit;cursor:' + (locked ? 'not-allowed' : 'pointer') + ';opacity:' + (locked ? 0.6 : 1),
        innerStyle: 'position:absolute;inset:0;display:block;transition:transform .8s cubic-bezier(.2,.7,.2,1);transform-style:preserve-3d;transform:rotateY(' + (revealed ? 180 : 0) + 'deg)'
      };
    });
    const mi = s.open;
    const modal = mi >= 0 ? { n: mi + 1, title: cardData[mi][0], body: cardData[mi][1], closeLabel: mi < 2 && s.rev <= mi ? 'Entendido, desbloquear la siguiente' : 'Cerrar' } : { n: 1, title: '', body: '', closeLabel: '' };

    const imgStyle = (on) => 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .7s ease,transform 1.1s ease;opacity:' + (on ? 1 : 0) + ';transform:scale(' + (on ? 1 : 1.08) + ')';

    const zoneData = [
      { short: 'San Francisco de Paula', color: '#4A8AC4', ink: '#0E1B3D', vicarias: ['Vicaría San Francisco de Paula', 'Vicaría San José-Chame'], vicario: 'Vicario Episcopal Territorial: Pbro. Rafael Ochomogo', sede: 'Panamá Oeste · Parroquia San Francisco de Paula, La Chorrera' },
      { short: 'Santa María La Antigua', color: '#55B167', ink: '#0E1B3D', vicarias: ['Vicaría Cristo Rey', 'Vicaría La Merced', 'Vicaría La Asunción', 'Vicaría Santa Eduvigis'], vicario: 'Vicario Episcopal Territorial: Pbro. Alejandro Goulbourne', sede: 'Panamá Centro · Parroquia Nuestra Señora de Lourdes, Carrasquilla (Arzobispado)' },
      { short: 'Cristo Redentor', color: '#E13355', ink: '#FFFFFF', vicarias: ['Vicaría Cristo Redentor', 'Vicaría Cristo Servidor', 'Vicaría Santa Cruz'], vicario: 'Vicario Episcopal Territorial: Pbro. Juan Sandoval', sede: 'San Miguelito' },
      { short: 'El Carmen', color: '#F5AF3E', ink: '#0E1B3D', vicarias: ['Vicaría Don Bosco', 'Vicaría El Carmen', 'Vicaría San Cristóbal', 'Vicaría Inmaculada Concepción'], vicario: 'Vicario Episcopal Territorial: Pbro. William Sánchez', sede: 'Panamá Este · Parroquia María Madre de Dios, Don Bosco' }
    ];
    const zs = zoneData.map((d, i) => ({
      pick: () => this.setState({ zone: i }),
      style: 'cursor:pointer;stroke-linejoin:round;fill:#fff;fill-opacity:' + (s.zone === -1 || s.zone === i ? 0 : 0.66) + ';stroke:' + (s.zone === i ? '#0E1B3D' : 'rgba(255,255,255,0)') + ';stroke-width:' + (s.zone === i ? 6 : 0) + ';filter:' + (s.zone === i ? 'drop-shadow(0 0 10px rgba(14,27,61,.7))' : 'none')
    }));
    const zoneBtns = zoneData.map((d, i) => {
      const on = s.zone === i;
      return {
        n: i + 1, name: d.short, count: d.vicarias.length + ' vicarías', active: on,
        pick: () => this.setState({ zone: i }),
        style: 'display:flex;align-items:center;gap:14px;width:100%;padding:12px 16px;border-radius:16px;font:inherit;cursor:pointer;min-height:56px;transition:all .3s;border:2px solid ' + d.color + ';background:' + (on ? d.color : 'transparent') + ';color:' + (on ? d.ink : '#F2F5FB'),
        numStyle: 'width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;flex:none;background:' + (on ? '#0E1B3D' : '#F2F5FB') + ';color:' + (on ? '#F2F5FB' : '#0E1B3D')
      };
    });
    const zsel = s.zone >= 0 ? zoneData[s.zone] : null;
    const zc = zsel
      ? { eyebrow: 'Zona pastoral · ' + zsel.vicarias.length + ' vicarías', name: zsel.short, color: zsel.color, vicario: zsel.vicario, sede: zsel.sede, vicarias: zsel.vicarias.map(n => ({ name: n })) }
      : { eyebrow: 'Zonas pastorales', name: 'Elige una zona', color: '#F0B544', vicario: 'Toca una zona del mapa o de la lista para conocer sus vicarías y a su vicario episcopal.', sede: '', vicarias: [] };

    const hitoData = [
      ['Cita Eucarística 2025 · Jubileo de la Familia', 'Con el primer catequista de la diócesis', 'Monseñor José Domingo Ulloa visitó el stand de la Comisión Arquidiocesana de Catequesis. Gracias por su visita.'],
      ['Formación', 'Catequistas en formación', 'Una jornada de encuentro y aprendizaje con catequistas de la Arquidiócesis.'],
      ['Encuentro', 'Jóvenes y catequistas, juntos', 'Un encuentro que reúne a catequistas y jóvenes de las comunidades.'],
      ['Comunidad', 'Catequistas en misión', 'Catequistas y familias compartiendo la fe en comunidad.']
    ];
    const hitoBtns = hitoData.map((d, i) => {
      const on = s.hito === i;
      return {
        tag: d[0], title: d[1], active: on,
        pick: () => this.setState({ hito: i }),
        style: 'display:flex;flex-direction:column;gap:6px;align-items:flex-start;text-align:left;width:100%;padding:18px 22px;border-radius:18px;font:inherit;cursor:pointer;min-height:56px;transition:all .3s;border:2px solid ' + gold + ';background:' + (on ? gold : 'transparent') + ';color:' + (on ? '#0E1B3D' : '#F2F5FB')
      };
    });
    const ht = { tag: hitoData[s.hito][0], title: hitoData[s.hito][1], text: hitoData[s.hito][2] };

    const dots = [];
    for (let i = 0; i < 14; i++) {
      const size = 4 + (i * 7) % 9;
      dots.push({ style: 'position:absolute;border-radius:50%;background:' + gold + ';width:' + size + 'px;height:' + size + 'px;left:' + ((i * 37 + 8) % 96) + '%;top:' + ((i * 53 + 12) % 88) + '%;animation-delay:-' + ((i * 1.3) % 7) + 's;animation-duration:' + (6 + (i % 5)) + 's' });
    }

    return {
      cards, modal, modalOpen: mi >= 0,
      closeCard: () => this.setState({ rev: Math.max(this.state.rev, this.state.open + 1), open: -1 }),
      stop: (e) => e.stopPropagation(),
      accent: gold, dots, steps, progress, cur: stepsData[s.step],
      words: ['Anunciar', 'Celebrar', 'Acompañar', 'Formar', 'Enviar', 'Servir'],
      services, subs, subText: subData[s.sub][1], agenda, intereses,
      subTitle: 'Catequesis ' + subData[s.sub][0].toLowerCase(),
      subImg0: imgStyle(s.sub === 0), subImg1: imgStyle(s.sub === 1), subImg2: imgStyle(s.sub === 2), subImg3: imgStyle(s.sub === 3),
      z0: zs[0], z1: zs[1], z2: zs[2], z3: zs[3], zoneBtns, zc,
      hitoBtns, ht, hi0: imgStyle(s.hito === 0), hi1: imgStyle(s.hito === 1), hi2: imgStyle(s.hito === 2), hi3: imgStyle(s.hito === 3),
      nombre: s.nombre, parroquia: s.parroquia, contacto: s.contacto, mensaje: s.mensaje,
      setNombre: (e) => this.setState({ nombre: e.target.value }),
      setParroquia: (e) => this.setState({ parroquia: e.target.value }),
      setContacto: (e) => this.setState({ contacto: e.target.value }),
      setMensaje: (e) => this.setState({ mensaje: e.target.value }),
      sent: s.sent, notSent: !s.sent,
      submit: (e) => { e.preventDefault(); this.setState({ sent: true }); },
      reset: () => this.setState({ sent: false, nombre: '', parroquia: '', contacto: '', mensaje: '' })
    };
  }
}
return Component;
};
