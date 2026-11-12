package pe.telco.activacion.web;

import pe.telco.activacion.service.ActivacionService;

public class ActivacionLineaServlet extends HttpServlet {
    private ActivacionService servicio;

    public void doPost(HttpServletRequest request, HttpServletResponse response) {
        String tipoPlan = request.getParameter("tipoPlan");
        String canal = request.getParameter("canal");
        if (tipoPlan == null || tipoPlan.isEmpty()) {
            request.setAttribute("error", "Debe indicar el tipo de plan");
            return;
        }
        if ("POS".equals(tipoPlan) && !"PRESENCIAL".equals(canal)) {
            servicio.registrarSolicitudPendiente(request);
        } else {
            servicio.activarLinea(request);
        }
    }
}
